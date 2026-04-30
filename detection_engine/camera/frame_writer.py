"""
Continuous Frame Writer - Eliminates Camera Feed Blackouts

This module ensures the live camera feed NEVER has blackouts by continuously
writing raw frames to disk at 30 FPS, completely independent of detection speed.

Critical for smooth video streaming in life-safety drowning detection system.
"""
import logging
import os
import time
import threading
from typing import Optional, Dict
import cv2
import numpy as np

logger = logging.getLogger(__name__)


class ContinuousFrameWriter:
    """
    Continuously writes the latest camera frame to disk at target FPS.

    Runs in a separate thread, independent of detection processing.
    Ensures stream never blacks out even if detection is slow.
    """

    def __init__(self, zone_id: str, output_dir: str, target_fps: int = 30):
        if target_fps <= 0:
            raise ValueError("target_fps must be positive")

        self.zone_id = zone_id
        self.output_dir = output_dir
        self.target_fps = target_fps
        self.frame_interval = 1.0 / target_fps

        self._latest_raw_frame: Optional[np.ndarray] = None
        self._latest_annotated_frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._write_count = 0

        # Output path - the stream reads from this file
        self.stream_frame_path = os.path.join(output_dir, f'{zone_id}_latest.jpg')

        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)

    def update_raw_frame(self, frame: np.ndarray) -> None:
        """Update raw frame from camera (called at camera FPS)."""
        with self._frame_lock:
            self._latest_raw_frame = frame.copy() if frame is not None else None

    def update_annotated_frame(self, frame: np.ndarray) -> None:
        """Update annotated frame from detection (called at detection FPS)."""
        with self._frame_lock:
            self._latest_annotated_frame = frame.copy() if frame is not None else None

    def start(self) -> None:
        """Start the continuous frame writer thread."""
        if self._thread is not None and self._thread.is_alive():
            logger.warning("[%s] Frame writer already running", self.zone_id)
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._write_loop,
            name=f"frame-writer-{self.zone_id}",
            daemon=True
        )
        self._thread.start()
        logger.info(
            "[%s] Continuous frame writer started @ %d FPS",
            self.zone_id,
            self.target_fps,
        )

    def stop(self) -> None:
        """Stop the continuous frame writer thread."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        logger.info(
            "[%s] Frame writer stopped (%d frames written)",
            self.zone_id,
            self._write_count,
        )

    def _write_loop(self) -> None:
        """Main loop - writes frames at target FPS regardless of detection speed."""
        last_log_time = time.time()
        frames_since_log = 0

        while not self._stop_event.is_set():
            loop_start = time.time()

            # Get best available frame (prefer annotated, fall back to raw)
            # Annotated frame is consumed on read so we don't keep
            # re-serving a stale detection result while fresh raw
            # frames are available.
            with self._frame_lock:
                if self._latest_annotated_frame is not None:
                    frame = self._latest_annotated_frame
                    self._latest_annotated_frame = None
                elif self._latest_raw_frame is not None:
                    frame = self._latest_raw_frame
                else:
                    frame = None

            if frame is not None:
                try:
                    self._atomic_write_jpeg(self.stream_frame_path, frame)
                    self._write_count += 1
                    frames_since_log += 1
                except Exception as exc:
                    logger.warning("[%s] Frame write failed: %s", self.zone_id, exc)

            # Log stats every 10 seconds
            now = time.time()
            if now - last_log_time >= 10.0:
                fps = frames_since_log / (now - last_log_time)
                logger.debug("[%s] Frame writer: %.1f FPS", self.zone_id, fps)
                last_log_time = now
                frames_since_log = 0

            # Maintain target FPS
            elapsed = time.time() - loop_start
            sleep_time = max(0, self.frame_interval - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)

    def _atomic_write_jpeg(self, path: str, frame: np.ndarray) -> None:
        """Atomically write JPEG (temp file + rename).

        On Windows, os.replace() can fail if another process has the file open.
        We use a retry mechanism with unique temp file names to handle this.
        """
        import uuid
        import shutil

        # Use unique temp file to avoid conflicts
        tmp_path = f"{path}.{uuid.uuid4().hex[:8]}.tmp"
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), 85]
        success, buffer = cv2.imencode('.jpg', frame, encode_param)

        if not success:
            raise RuntimeError("JPEG encoding failed")

        try:
            with open(tmp_path, 'wb') as f:
                f.write(buffer.tobytes())

            # Try atomic replace with retries for Windows file locking
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    os.replace(tmp_path, path)
                    return
                except PermissionError:
                    if attempt < max_retries - 1:
                        time.sleep(0.005)  # 5ms backoff
                    else:
                        # Fallback: use shutil.move which handles cross-device moves
                        try:
                            shutil.move(tmp_path, path)
                            return
                        except Exception:
                            pass
                        raise
        finally:
            # Clean up temp file if it still exists
            try:
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            except Exception:
                pass


class FrameWriterRegistry:
    """Manages frame writers for multiple camera zones."""

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self.writers: Dict[str, ContinuousFrameWriter] = {}
        self._lock = threading.Lock()

    def register(self, zone_id: str, target_fps: int = 30) -> ContinuousFrameWriter:
        """Register a frame writer for a camera zone."""
        with self._lock:
            if zone_id in self.writers:
                return self.writers[zone_id]

            writer = ContinuousFrameWriter(zone_id, self.output_dir, target_fps)
            self.writers[zone_id] = writer
            return writer

    def get(self, zone_id: str) -> Optional[ContinuousFrameWriter]:
        """Get frame writer for a zone."""
        with self._lock:
            return self.writers.get(zone_id)

    def start_all(self) -> None:
        """Start all registered frame writers."""
        with self._lock:
            for writer in self.writers.values():
                writer.start()
        logger.info("Started %d frame writers", len(self.writers))

    def stop_all(self) -> None:
        """Stop all registered frame writers."""
        with self._lock:
            for writer in self.writers.values():
                writer.stop()
        logger.info("Stopped all frame writers")
