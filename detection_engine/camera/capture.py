"""Camera capture — threaded frame reader with exponential backoff reconnect."""
import logging
import threading
import time
from typing import Optional, Tuple, Dict, Any

import cv2
import platform
import numpy as np

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from config.settings import RECONNECT_BACKOFF_SECONDS, RECONNECT_MAX_CONSECUTIVE_FAILURES

logger = logging.getLogger(__name__)


class CameraCapture:
    """Threaded camera reader with automatic reconnect on failure."""

    def __init__(self, zone_id: str, rtsp_url, frame_rate: int = 30):
        self.zone_id = zone_id
        self.rtsp_url = rtsp_url
        self.frame_rate = frame_rate

        self._cap: Optional[cv2.VideoCapture] = None
        self._cap_lock = threading.Lock()
        self._latest_frame: Optional[np.ndarray] = None
        self._frame_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._consecutive_failures = 0

    def start(self) -> None:
        """Open the video capture and launch the background capture thread."""
        cap = self._open_capture()
        self._set_capture(cap)
        if not cap.isOpened():
            logger.warning(
                "[%s] Failed to open camera at startup — will retry in loop", self.zone_id
            )
        else:
            logger.info("[%s] Camera connected: %s", self.zone_id, self.rtsp_url)

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._capture_loop, name=f"capture-{self.zone_id}", daemon=True
        )
        self._thread.start()

    def read(self) -> Tuple[Optional[np.ndarray], Dict[str, Any]]:
        """Return the most recent frame and metadata.

        Returns:
            (frame, metadata) where frame may be None if no frame yet received.
        """
        import datetime
        with self._frame_lock:
            frame = self._latest_frame.copy() if self._latest_frame is not None else None
        metadata = {
            "zone_id": self.zone_id,
            "timestamp": datetime.datetime.utcnow().isoformat(),
        }
        return frame, metadata

    def stop(self) -> None:
        """Signal the capture thread to stop and wait for it to finish."""
        self._stop_event.set()
        self._release_capture()
        if self._thread is not None:
            self._thread.join()
        self._release_capture()
        logger.info("[%s] Camera capture stopped", self.zone_id)

    # ── Private ───────────────────────────────────────────────────────────────

    def _capture_loop(self) -> None:
        """Main capture loop — reads frames and stores the latest."""
        interval = 1.0 / max(self.frame_rate, 1)

        while not self._stop_event.is_set():
            ret = False
            frame = None
            should_reconnect = False

            with self._cap_lock:
                cap = self._cap
                if cap is None or not cap.isOpened():
                    should_reconnect = True
                else:
                    try:
                        ret, frame = cap.read()
                    except Exception as exc:
                        logger.warning("[%s] Exception while reading frame: %s", self.zone_id, exc)
                        ret, frame = False, None

            if should_reconnect:
                self._reconnect()
                continue

            if not ret or frame is None:
                self._consecutive_failures += 1
                logger.warning(
                    "[%s] Frame read failed (consecutive=%d)",
                    self.zone_id,
                    self._consecutive_failures,
                )
                if self._consecutive_failures >= RECONNECT_MAX_CONSECUTIVE_FAILURES:
                    logger.error("[%s] Too many failures — triggering reconnect", self.zone_id)
                    self._reconnect()
                continue

            self._consecutive_failures = 0
            with self._frame_lock:
                self._latest_frame = frame

            time.sleep(interval)

    def _reconnect(self) -> None:
        """Exponential backoff reconnect loop."""
        self._release_capture()

        for delay in RECONNECT_BACKOFF_SECONDS:
            if self._stop_event.is_set():
                return
            logger.info("[%s] Reconnecting in %ds ...", self.zone_id, delay)
            # Interruptible wait: allows immediate shutdown instead of waiting full delay.
            if self._stop_event.wait(delay):
                return
            # Re-check before opening handle to avoid stop/reconnect race.
            if self._stop_event.is_set():
                return

            cap = self._open_capture()
            self._set_capture(cap)
            if cap.isOpened():
                self._consecutive_failures = 0
                logger.info("[%s] Reconnected successfully", self.zone_id)
                return
            logger.warning("[%s] Reconnect attempt failed", self.zone_id)

        logger.error(
            "[%s] Reconnect exhausted after %d attempts — will retry next cycle",
            self.zone_id,
            len(RECONNECT_BACKOFF_SECONDS),
        )
        self._consecutive_failures = 0  # reset so outer loop tries again

    def _open_capture(self) -> cv2.VideoCapture:
        with self._cap_lock:
            return (
                cv2.VideoCapture(int(self.rtsp_url), cv2.CAP_DSHOW)
                if platform.system() == 'Windows' and str(self.rtsp_url).isdigit()
                else cv2.VideoCapture(self.rtsp_url)
            )

    def _release_capture(self) -> None:
        with self._cap_lock:
            if self._cap is not None:
                self._cap.release()
                self._cap = None

    def _set_capture(self, cap: Optional[cv2.VideoCapture]) -> None:
        with self._cap_lock:
            self._cap = cap
