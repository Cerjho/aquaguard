"""API client — HTTP client for logging detection events to the Flask backend."""
import logging
from collections import deque
from threading import Lock
import requests
from requests.adapters import HTTPAdapter

from detection_engine.models_data.alert_payload import AlertPayload

logger = logging.getLogger(__name__)

_REQUEST_TIMEOUT_SECONDS = 5
_FAILED_EVENT_QUEUE_MAX = 500
_POOL_CONNECTIONS = 10
_POOL_MAXSIZE = 20


class APIClient:
    """Posts detection events to the AquaGuard Flask REST API.

    All network errors are caught and logged — the detection loop must never
    crash due to a transient API failure.
    """

    def __init__(self, base_url: str, api_key: str):
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._session = requests.Session()
        adapter = HTTPAdapter(pool_connections=_POOL_CONNECTIONS, pool_maxsize=_POOL_MAXSIZE)
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)
        self._failed_event_queue = deque(maxlen=_FAILED_EVENT_QUEUE_MAX)
        self._queue_lock = Lock()
        self._session.headers.update({
            "Content-Type": "application/json",
            "X-API-Key": api_key,
        })

    def _post_event(self, url: str, data: dict) -> bool:
        try:
            response = self._session.post(url, json=data, timeout=_REQUEST_TIMEOUT_SECONDS)
            if response.status_code in (200, 201):
                return True
            logger.error(
                "API log_event returned %d: %s",
                response.status_code,
                response.text[:200],
            )
            return False
        except requests.exceptions.ConnectionError as exc:
            logger.error("API connection error (log_event): %s", exc)
            return False
        except requests.exceptions.Timeout:
            logger.error("API request timed out after %ds", _REQUEST_TIMEOUT_SECONDS)
            return False
        except requests.exceptions.RequestException as exc:
            logger.error("API request exception (log_event): %s", exc)
            return False

    def _enqueue_failed_event(self, data: dict) -> None:
        with self._queue_lock:
            queue_was_full = len(self._failed_event_queue) == self._failed_event_queue.maxlen
            self._failed_event_queue.append(data)
            queued_count = len(self._failed_event_queue)
        if queue_was_full:
            logger.error(
                "API retry queue full (%d); oldest event payload was dropped",
                _FAILED_EVENT_QUEUE_MAX,
            )
        logger.warning("Queued event for retry. pending_retries=%d", queued_count)

    def _flush_failed_events(self, url: str) -> None:
        while True:
            with self._queue_lock:
                if not self._failed_event_queue:
                    return
                candidate = self._failed_event_queue[0]
            if not self._post_event(url, candidate):
                return
            with self._queue_lock:
                if self._failed_event_queue and self._failed_event_queue[0] == candidate:
                    self._failed_event_queue.popleft()

    def log_event(self, payload: AlertPayload) -> None:
        """POST alert payload to /api/v1/events.

        Args:
            payload: AlertPayload dataclass instance.
        """
        url = f"{self._base_url}/api/v1/events"
        data = {
            "event_id": payload.event_id,
            "zone_id": payload.zone_id,
            "track_id": payload.track_id,
            "class_label": payload.class_label,
            "yolo_confidence": payload.yolo_confidence,
            "pose_confidence": payload.pose_confidence,
            "final_confidence": payload.final_confidence,
            "confidence_score": payload.score,
            "behavior_flags": {},
            "snapshot_base64": payload.snapshot_b64,
            "detected_at": payload.timestamp,
            "alert_triggered": True,
        }
        self._flush_failed_events(url)
        if not self._post_event(url, data):
            self._enqueue_failed_event(data)

    def fetch_active_cameras(self) -> list[dict]:
        """Fetch active camera list from backend internal endpoint.

        Returns:
            List of camera dictionaries from payload shape {"cameras": [...]}.

        Raises:
            RuntimeError: If backend request fails, returns non-200, or payload
                shape is malformed.
        """
        url = f"{self._base_url}/api/v1/internal/cameras"
        try:
            response = self._session.get(url, timeout=_REQUEST_TIMEOUT_SECONDS)
        except requests.exceptions.RequestException as exc:
            logger.error("API fetch_active_cameras request failed: %s", exc)
            raise RuntimeError("Failed to fetch active cameras from backend") from exc

        if response.status_code != 200:
            logger.error(
                "API fetch_active_cameras returned %d: %s",
                response.status_code,
                response.text[:200],
            )
            raise RuntimeError(
                f"Backend camera fetch failed with status {response.status_code}"
            )

        try:
            payload = response.json()
        except ValueError as exc:
            logger.error("API fetch_active_cameras returned non-JSON response")
            raise RuntimeError("Backend camera fetch returned invalid JSON") from exc

        data = payload.get("data") if isinstance(payload, dict) else None
        cameras = data.get("cameras") if isinstance(data, dict) else None
        if not isinstance(cameras, list):
            logger.error(
                "API fetch_active_cameras malformed payload: expected {'cameras': [...]} got %r",
                payload,
            )
            raise RuntimeError("Backend camera fetch payload malformed")

        return cameras
