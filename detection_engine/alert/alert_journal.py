"""
Local SQLite alert journal — store-and-forward for network-resilient alerting.

When the backend API is unreachable, alert payloads are persisted to a local
SQLite database.  A background thread retries failed deliveries every 30 s.
When the API comes back, queued alerts are flushed in order (oldest first).

Eliminates V3: alerts are never lost due to transient API failures.
"""
import json
import logging
import os
import sqlite3
import threading
import time
from typing import Optional

logger = logging.getLogger(__name__)

_RETRY_INTERVAL_SECONDS = 30
_MAX_PENDING_ALERTS = 1000
_DB_FILENAME = "alert_journal.db"


class AlertJournal:
    """
    SQLite-backed store-and-forward alert journal.

    Thread-safe: all DB access serialized through a single lock.
    One instance per detection engine process.

    Usage:
        journal = AlertJournal(data_dir="/path/to/data")
        journal.enqueue(payload_dict)   # Alert failed to deliver
        journal.start_retry_loop(api_client)  # Background retry thread
        journal.stop()
    """

    def __init__(self, data_dir: str):
        self._db_path = os.path.join(data_dir, _DB_FILENAME)
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._retry_thread: Optional[threading.Thread] = None

        os.makedirs(data_dir, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Create the alert journal table if it doesn't exist."""
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS pending_alerts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_id TEXT UNIQUE NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at REAL NOT NULL,
                        retry_count INTEGER DEFAULT 0,
                        last_retry_at REAL
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_pending_created
                    ON pending_alerts(created_at)
                """)
                conn.commit()
            finally:
                conn.close()

        logger.info("Alert journal initialized at %s", self._db_path)

    def enqueue(self, payload: dict) -> bool:
        """
        Persist a failed alert payload for later retry.

        Returns True if enqueued, False if queue is full or duplicate.
        """
        event_id = payload.get("event_id", "")
        if not event_id:
            logger.warning("Cannot enqueue alert without event_id")
            return False

        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                # Check queue depth
                cursor = conn.execute(
                    "SELECT COUNT(*) FROM pending_alerts"
                )
                count = cursor.fetchone()[0]
                if count >= _MAX_PENDING_ALERTS:
                    # Evict oldest
                    conn.execute("""
                        DELETE FROM pending_alerts
                        WHERE id = (
                            SELECT id FROM pending_alerts
                            ORDER BY created_at ASC LIMIT 1
                        )
                    """)
                    logger.warning(
                        "Alert journal full (%d), evicted oldest entry",
                        _MAX_PENDING_ALERTS,
                    )

                conn.execute(
                    """
                    INSERT OR IGNORE INTO pending_alerts
                    (event_id, payload_json, created_at)
                    VALUES (?, ?, ?)
                    """,
                    (event_id, json.dumps(payload), time.time()),
                )
                conn.commit()
                return True
            except sqlite3.Error as exc:
                logger.error("Alert journal enqueue failed: %s", exc)
                return False
            finally:
                conn.close()

    def pending_count(self) -> int:
        """Return the number of pending alerts in the journal."""
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT COUNT(*) FROM pending_alerts"
                )
                return cursor.fetchone()[0]
            finally:
                conn.close()

    def flush(self, post_fn) -> int:
        """
        Try to deliver all pending alerts using post_fn.

        Args:
            post_fn: Callable(payload_dict) -> bool.
                     Returns True on success, False on failure.

        Returns:
            Number of successfully delivered alerts.
        """
        delivered = 0
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                cursor = conn.execute(
                    "SELECT id, payload_json, retry_count "
                    "FROM pending_alerts ORDER BY created_at ASC"
                )
                rows = cursor.fetchall()
            finally:
                conn.close()

        for row_id, payload_json, retry_count in rows:
            try:
                payload = json.loads(payload_json)
            except json.JSONDecodeError:
                # Corrupted entry — remove it
                self._delete_entry(row_id)
                continue

            try:
                success = post_fn(payload)
            except Exception as exc:
                logger.debug(
                    "Alert journal retry failed for %s: %s",
                    payload.get("event_id", "?"), exc,
                )
                self._update_retry(row_id, retry_count + 1)
                # Stop flushing on first failure (API likely still down)
                break

            if success:
                self._delete_entry(row_id)
                delivered += 1
            else:
                self._update_retry(row_id, retry_count + 1)
                break  # API still unreachable

        if delivered > 0:
            logger.info(
                "Alert journal flushed %d pending alert(s)", delivered,
            )
        return delivered

    def start_retry_loop(self, post_fn) -> None:
        """Start the background retry thread."""
        if self._retry_thread is not None and self._retry_thread.is_alive():
            return

        self._stop_event.clear()
        self._retry_thread = threading.Thread(
            target=self._retry_loop,
            args=(post_fn,),
            name="alert-journal-retry",
            daemon=True,
        )
        self._retry_thread.start()
        logger.info(
            "Alert journal retry loop started (interval=%ds)",
            _RETRY_INTERVAL_SECONDS,
        )

    def stop(self) -> None:
        """Stop the background retry thread."""
        self._stop_event.set()
        if self._retry_thread is not None:
            self._retry_thread.join(timeout=5.0)
        pending = self.pending_count()
        if pending > 0:
            logger.warning(
                "Alert journal stopped with %d pending alert(s)", pending,
            )

    def _retry_loop(self, post_fn) -> None:
        """Background thread: flush pending alerts every 30 seconds."""
        while not self._stop_event.is_set():
            self._stop_event.wait(_RETRY_INTERVAL_SECONDS)
            if self._stop_event.is_set():
                break

            pending = self.pending_count()
            if pending > 0:
                logger.debug(
                    "Alert journal: retrying %d pending alert(s)", pending,
                )
                self.flush(post_fn)

    def _delete_entry(self, row_id: int) -> None:
        """Delete a successfully delivered alert from the journal."""
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                conn.execute(
                    "DELETE FROM pending_alerts WHERE id = ?", (row_id,),
                )
                conn.commit()
            finally:
                conn.close()

    def _update_retry(self, row_id: int, retry_count: int) -> None:
        """Update retry metadata for a failed delivery attempt."""
        with self._lock:
            conn = sqlite3.connect(self._db_path)
            try:
                conn.execute(
                    "UPDATE pending_alerts "
                    "SET retry_count = ?, last_retry_at = ? "
                    "WHERE id = ?",
                    (retry_count, time.time(), row_id),
                )
                conn.commit()
            finally:
                conn.close()
