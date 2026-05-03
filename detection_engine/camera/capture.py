"""Camera capture — threaded frame reader with robust RTSP support.

Features:
- TCP transport for reliable RTSP streaming
- Configurable connection and read timeouts
- Stall detection with auto-recovery
- Enhanced frame validation (H.264 corruption detection)
- Real-time health metrics tracking
- Exponential backoff reconnection
"""
import logging
import os
import platform
import re
import threading
import time
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any
from urllib.parse import urlparse, urlunparse

import cv2
import numpy as np

from config.settings import (
    RECONNECT_BACKOFF_SECONDS,
    RECONNECT_MAX_CONSECUTIVE_FAILURES,
    RTSP_TRANSPORT,
    RTSP_CONNECT_TIMEOUT_SECONDS,
    RTSP_READ_TIMEOUT_SECONDS,
    RTSP_STALL_THRESHOLD_SECONDS,
    RTSP_BUFFER_SIZE,
    CAMERA_HEALTH_LOG_INTERVAL_SECONDS,
)
from detection_engine.camera.health import HealthTracker

logger = logging.getLogger(__name__)

# Suppress FFmpeg verbose H.264 decoding errors to stderr
os.environ['OPENCV_FFMPEG_LOGLEVEL'] = '-8'
os.environ['OPENCV_LOG_LEVEL'] = 'SILENT'

# Configure FFmpeg capture options for RTSP robustness
# rtsp_transport: tcp (reliable) vs udp (low latency but lossy)
# stimeout/rw_timeout: connect/read socket timeouts in microseconds
_FFMPEG_CONNECT_TIMEOUT_US = RTSP_CONNECT_TIMEOUT_SECONDS * 1_000_000
_FFMPEG_READ_TIMEOUT_US = RTSP_READ_TIMEOUT_SECONDS * 1_000_000


def _build_ffmpeg_capture_options(rtsp_transport: Optional[str]) -> str:
    """Build FFmpeg capture option string for OpenCV."""
    options = []
    if rtsp_transport:
        options.append(f'rtsp_transport;{rtsp_transport}')
    options.extend(
        [
            f'stimeout;{_FFMPEG_CONNECT_TIMEOUT_US}',
            f'rw_timeout;{_FFMPEG_READ_TIMEOUT_US}',
            f'buffer_size;{RTSP_BUFFER_SIZE * 1024 * 1024}',
        ]
    )
    return '|'.join(options)


os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = _build_ffmpeg_capture_options(
    RTSP_TRANSPORT
)

# Suppress OpenCV warnings about codec errors
try:
    cv2.setLogLevel(0)  # 0 = SILENT
except AttributeError:
    pass


def mask_rtsp_credentials(url: str) -> str:
    """Mask credentials in RTSP URL for safe logging."""
    if not isinstance(url, str):
        return str(url)
    try:
        parsed = urlparse(url)
        if parsed.username:
            masked_netloc = f"{parsed.username}:****@{parsed.hostname}"
            if parsed.port:
                masked_netloc += f":{parsed.port}"
            return urlunparse(parsed._replace(netloc=masked_netloc))
    except (ValueError, AttributeError):
        pass
    return re.sub(r'://[^:]+:[^@]+@', '://****:****@', url)


def validate_rtsp_url(url) -> Tuple[bool, str]:
    """Validate RTSP URL format.

    Returns:
        (is_valid, error_message)
    """
    if url is None:
        return False, "URL is None"

    # Allow numeric webcam indices
    if isinstance(url, int) or (isinstance(url, str) and url.isdigit()):
        return True, ""

    if not isinstance(url, str):
        return False, f"URL must be string, got {type(url).__name__}"

    url_lower = url.lower()
    valid_schemes = ('rtsp://', 'rtmp://', 'http://', 'https://', 'file://')

    if not any(url_lower.startswith(scheme) for scheme in valid_schemes):
        return False, f"Invalid URL scheme. Expected one of: {valid_schemes}"

    try:
        parsed = urlparse(url)
        if not parsed.hostname and not url_lower.startswith('file://'):
            return False, "Missing hostname in URL"
    except ValueError as exc:
        return False, f"URL parse error: {exc}"

    return True, ""


class CameraCapture:
    """Threaded camera reader with robust RTSP support and health tracking."""

    def __init__(self, zone_id: str, rtsp_url, frame_rate: int = 30):
        if frame_rate <= 0:
            raise ValueError("frame_rate must be positive")

        is_valid, error = validate_rtsp_url(rtsp_url)
        if not is_valid:
            raise ValueError(f"Invalid RTSP URL for zone {zone_id}: {error}")

        self.zone_id = zone_id
        self.rtsp_url = rtsp_url
        self.frame_rate = frame_rate
        self._is_local_camera = isinstance(rtsp_url, int) or (
            isinstance(rtsp_url, str) and rtsp_url.isdigit()
        )

        self._cap: Optional[cv2.VideoCapture] = None
        self._cap_lock = threading.Lock()
        self._latest_frame: Optional[np.ndarray] = None
        self._latest_frame_timestamp: Optional[str] = None
        self._latest_frame_sequence = 0
        self._frame_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._consecutive_failures = 0

        # Stall detection
        self._last_frame_time = time.time()
        self._stall_threshold = RTSP_STALL_THRESHOLD_SECONDS

        # Health tracking
        self._health_tracker = HealthTracker(zone_id, fps_target=float(frame_rate))
        self._last_health_log = time.time()

    @property
    def health(self):
        """Return current health metrics."""
        return self._health_tracker.health

    def start(self) -> None:
        """Open the video capture and launch the background capture thread."""
        self._health_tracker.start()
        self._last_frame_time = time.time()

        cap = self._open_capture()
        self._set_capture(cap)

        if not cap.isOpened():
            logger.warning(
                "[%s] Failed to open camera at startup — will retry in loop",
                self.zone_id,
            )
            self._health_tracker.disconnected("Failed to open at startup")
        else:
            logger.info(
                "[%s] Camera connected: %s",
                self.zone_id,
                mask_rtsp_credentials(self.rtsp_url),
            )
            self._health_tracker.connected()

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._capture_loop, name=f"capture-{self.zone_id}", daemon=True
        )
        self._thread.start()

    def read(self, copy_frame: bool = False) -> Tuple[Optional[np.ndarray], Dict[str, Any]]:
        """Return the most recent frame and metadata.

        Returns:
            (frame, metadata) where frame may be None if no frame yet received.
        """
        with self._frame_lock:
            if self._latest_frame is None:
                frame = None
                frame_timestamp = None
                frame_sequence = 0
            else:
                frame = self._latest_frame.copy() if copy_frame else self._latest_frame
                frame_timestamp = self._latest_frame_timestamp
                frame_sequence = self._latest_frame_sequence

        health = self._health_tracker.health
        metadata = {
            "zone_id": self.zone_id,
            "timestamp": frame_timestamp or datetime.now(timezone.utc).isoformat(),
            "frame_sequence": frame_sequence,
            "status": health.status,
            "fps_actual": health.fps_actual,
        }
        return frame, metadata

    def stop(self) -> None:
        """Signal the capture thread to stop and wait for it to finish."""
        self._stop_event.set()
        self._release_capture()
        if self._thread is not None:
            self._thread.join()
        self._release_capture()
        self._health_tracker.disconnected("Stopped")
        logger.info("[%s] Camera capture stopped", self.zone_id)

    def test_connection(self, timeout_seconds: int = 10) -> Tuple[bool, str, Dict[str, Any]]:
        """Test camera connection and return stream capabilities.

        Args:
            timeout_seconds: Maximum time to wait for connection.

        Returns:
            (success, error_message, capabilities_dict)
        """
        capabilities: Dict[str, Any] = {
            'zone_id': self.zone_id,
            'url': mask_rtsp_credentials(self.rtsp_url),
            'connected': False,
            'width': 0,
            'height': 0,
            'fps': 0,
            'codec': '',
        }

        try:
            cap = self._open_capture()
            if not cap.isOpened():
                return False, "Failed to open camera stream", capabilities

            # Try reading a frame
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.release()
                return False, "Failed to read frame from stream", capabilities

            # Get stream properties
            capabilities['connected'] = True
            capabilities['width'] = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            capabilities['height'] = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            capabilities['fps'] = cap.get(cv2.CAP_PROP_FPS)
            capabilities['codec'] = self._get_codec_name(cap)

            cap.release()
            return True, "", capabilities

        except (cv2.error, OSError, RuntimeError) as exc:
            return False, str(exc), capabilities

    def _get_codec_name(self, cap: cv2.VideoCapture) -> str:
        """Get human-readable codec name from VideoCapture."""
        try:
            fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
            if fourcc > 0:
                return ''.join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
        except (ValueError, OverflowError):
            pass
        return 'unknown'

    # ── Private ───────────────────────────────────────────────────────────────

    def _sleep_after_success_seconds(self) -> float:
        """Return post-read sleep for successful captures.

        For RTSP/HTTP streams, cap.read() is already paced by network/source.
        Sleeping again reduces effective frame rate and makes live view sluggish.
        """
        if self._is_local_camera:
            return 1.0 / max(self.frame_rate, 1)
        return 0.0

    def _capture_loop(self) -> None:
        """Main capture loop — reads frames with stall detection and health tracking."""
        interval = 1.0 / max(self.frame_rate, 1)
        success_sleep = self._sleep_after_success_seconds()
        skip_corrupted_frames = 0

        while not self._stop_event.is_set():
            ret = False
            frame = None
            should_reconnect = False

            # Check for stream stall
            if self._check_stall():
                logger.warning(
                    "[%s] Stream stalled (no frames for %.1fs), triggering reconnect",
                    self.zone_id,
                    self._stall_threshold,
                )
                should_reconnect = True

            if not should_reconnect:
                with self._cap_lock:
                    cap = self._cap
                    if cap is None or not cap.isOpened():
                        should_reconnect = True
                    else:
                        try:
                            ret, frame = cap.read()

                            if ret and frame is not None:
                                is_valid, reason = self._validate_frame(frame)
                                if not is_valid:
                                    self._record_frame(corrupted=True)
                                    ret, frame = False, None
                                    skip_corrupted_frames += 1
                                    if skip_corrupted_frames % 10 == 0:
                                        logger.debug(
                                            "[%s] Corrupted frame: %s (count: %d)",
                                            self.zone_id,
                                            reason,
                                            skip_corrupted_frames,
                                        )
                                else:
                                    self._record_frame(corrupted=False)
                                    skip_corrupted_frames = 0
                                    self._last_frame_time = time.time()

                            if skip_corrupted_frames >= 50:
                                logger.warning(
                                    "[%s] Too many consecutive corrupted frames (%d), "
                                    "triggering reconnect",
                                    self.zone_id,
                                    skip_corrupted_frames,
                                )
                                skip_corrupted_frames = 0
                                should_reconnect = True

                        except (cv2.error, OSError, RuntimeError, ValueError) as exc:
                            logger.debug(
                                "[%s] Frame read exception: %s",
                                self.zone_id,
                                str(exc)[:100],
                            )
                            self._record_frame(corrupted=True)
                            ret, frame = False, None
                            skip_corrupted_frames += 1

            if should_reconnect:
                self._reconnect()
                continue

            if not ret or frame is None:
                self._consecutive_failures += 1
                if self._consecutive_failures >= RECONNECT_MAX_CONSECUTIVE_FAILURES:
                    logger.error(
                        "[%s] Too many consecutive failures — triggering reconnect",
                        self.zone_id,
                    )
                    self._reconnect()
                time.sleep(interval * 2)
                continue

            self._consecutive_failures = 0
            with self._frame_lock:
                self._latest_frame = frame
                self._latest_frame_timestamp = datetime.now(timezone.utc).isoformat()
                self._latest_frame_sequence += 1

            # Periodic health logging
            self._log_health_if_needed()

            if success_sleep > 0:
                time.sleep(success_sleep)

    def _check_stall(self) -> bool:
        """Return True if stream appears stalled (no frames for threshold period)."""
        return (time.time() - self._last_frame_time) > self._stall_threshold

    def _reconnect(self) -> None:
        """Exponential backoff reconnect loop with health tracking."""
        self._release_capture()
        self._health_tracker.reconnecting()

        for delay in RECONNECT_BACKOFF_SECONDS:
            if self._stop_event.is_set():
                return
            logger.info("[%s] Reconnecting in %ds ...", self.zone_id, delay)

            if self._stop_event.wait(delay):
                return
            if self._stop_event.is_set():
                return

            cap = self._open_capture()
            self._set_capture(cap)

            if cap.isOpened():
                # Verify we can actually read a frame before declaring success
                ret, frame = cap.read()
                if ret and frame is not None:
                    # FIX: Run full validation after reconnect (catches subtle H.264 corruption)
                    is_valid, reason = self._validate_frame(frame)
                    if not is_valid:
                        logger.warning(
                            "[%s] First frame after reconnect is corrupted: %s",
                            self.zone_id,
                            reason,
                        )
                        self._release_capture()
                        continue  # Try next reconnect attempt
                    
                    self._consecutive_failures = 0
                    self._last_frame_time = time.time()
                    self._health_tracker.connected()
                    logger.info("[%s] Reconnected successfully", self.zone_id)
                    return
                else:
                    logger.warning("[%s] Opened but cannot read frame", self.zone_id)
                    self._release_capture()

            logger.warning("[%s] Reconnect attempt failed", self.zone_id)

        self._health_tracker.disconnected("Reconnect exhausted")
        logger.error(
            "[%s] Reconnect exhausted after %d attempts — cooling down for 30s",
            self.zone_id,
            len(RECONNECT_BACKOFF_SECONDS),
        )
        # Cooldown period to prevent rapid reconnect loops
        self._last_frame_time = time.time() + 20  # Fake "recent frame" to delay stall detection
        self._consecutive_failures = 0

    def _open_capture(self) -> cv2.VideoCapture:
        """Open video capture with optimized settings for RTSP."""
        with self._cap_lock:
            # Local webcam (numeric index)
            if isinstance(self.rtsp_url, int) or (
                isinstance(self.rtsp_url, str) and self.rtsp_url.isdigit()
            ):
                cam_idx = int(self.rtsp_url)

                # On Windows, try DirectShow first, then MSMF, then default
                if platform.system() == 'Windows':
                    # Try DirectShow (better compatibility with most webcams)
                    cap = cv2.VideoCapture(cam_idx, cv2.CAP_DSHOW)
                    if cap.isOpened():
                        # Set reasonable buffer size to reduce latency
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        return cap
                    cap.release()

                    # Fallback to Media Foundation
                    cap = cv2.VideoCapture(cam_idx, cv2.CAP_MSMF)
                    if cap.isOpened():
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        return cap
                    cap.release()

                    # Last resort: default backend
                    logger.debug("[%s] Trying default backend for webcam %d", self.zone_id, cam_idx)
                    return cv2.VideoCapture(cam_idx)
                else:
                    # Non-Windows: use default backend
                    return cv2.VideoCapture(cam_idx)

            # RTSP streams can be sensitive to transport negotiation. Try configured
            # transport first, then the opposite transport, then auto transport.
            if isinstance(self.rtsp_url, str) and self.rtsp_url.lower().startswith('rtsp://'):
                return self._open_rtsp_with_transport_fallbacks()

            return self._open_network_capture(None)

    def _open_network_capture(self, rtsp_transport: Optional[str]) -> cv2.VideoCapture:
        """Open network capture with FFmpeg and optional RTSP transport hint."""
        os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = _build_ffmpeg_capture_options(
            rtsp_transport
        )
        open_timeout_ms = RTSP_CONNECT_TIMEOUT_SECONDS * 1000
        read_timeout_ms = RTSP_READ_TIMEOUT_SECONDS * 1000

        # Pass timeouts at construction time when supported to avoid hangs in
        # the FFmpeg open path on non-responsive cameras.
        try:
            cap = cv2.VideoCapture(
                self.rtsp_url,
                cv2.CAP_FFMPEG,
                [
                    cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
                    open_timeout_ms,
                    cv2.CAP_PROP_READ_TIMEOUT_MSEC,
                    read_timeout_ms,
                ],
            )
        except TypeError:
            cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)

        cap.set(cv2.CAP_PROP_BUFFERSIZE, RTSP_BUFFER_SIZE)

        try:
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, open_timeout_ms)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, read_timeout_ms)
        except AttributeError:
            pass

        return cap

    def _open_rtsp_with_transport_fallbacks(self) -> cv2.VideoCapture:
        """Open RTSP stream with transport fallbacks for compatibility."""
        transports = [RTSP_TRANSPORT]
        alternate_transport = 'udp' if RTSP_TRANSPORT == 'tcp' else 'tcp'
        transports.append(alternate_transport)
        transports.append(None)

        for transport in transports:
            cap = self._open_network_capture(transport)
            if cap.isOpened():
                if transport != RTSP_TRANSPORT:
                    logger.info(
                        "[%s] RTSP opened using fallback transport: %s",
                        self.zone_id,
                        transport or 'auto',
                    )
                return cap

            cap.release()

        # Restore configured default options after fallback attempts.
        os.environ['OPENCV_FFMPEG_CAPTURE_OPTIONS'] = _build_ffmpeg_capture_options(
            RTSP_TRANSPORT
        )
        return self._open_network_capture(RTSP_TRANSPORT)

    def _release_capture(self) -> None:
        with self._cap_lock:
            if self._cap is not None:
                try:
                    self._cap.release()
                except (cv2.error, OSError):
                    pass
                self._cap = None
                # On Windows, give OS time to release the device
                if platform.system() == 'Windows':
                    time.sleep(0.1)

    def _set_capture(self, cap: Optional[cv2.VideoCapture]) -> None:
        with self._cap_lock:
            self._cap = cap

    def _validate_frame(self, frame: np.ndarray) -> Tuple[bool, str]:
        """Validate frame data integrity (lightweight).

        Uses a small center sample to avoid expensive full-frame scans
        that would slow the capture thread and increase stream latency.
        
        Also detects NaN/Inf values that cause GPU CUDA errors during inference.

        Returns:
            (is_valid, reason)
        """
        if frame is None:
            return False, "frame_is_none"
        if frame.size == 0:
            return False, "empty_frame"
        if len(frame.shape) != 3:
            return False, "invalid_dimensions"

        height, width, channels = frame.shape
        if height < 10 or width < 10:
            return False, "frame_too_small"
        if channels != 3:
            return False, "invalid_channels"

        # Sample a small center patch for corruption checks (~0.5% of frame)
        # This avoids expensive full-frame np.max/np.std that tank FPS
        cy, cx = height // 2, width // 2
        patch = frame[cy - 50:cy + 50, cx - 50:cx + 50]

        # Check if patch is completely black (all zeros) - likely corrupted
        if np.max(patch) == 0:
            return False, "all_black_frame"

        # Check for extremely low variance (solid color or corrupt)
        if np.std(patch) < 0.1:
            return False, "no_variance"

        # H.264 decode errors often produce green/purple frames
        if self._is_green_corrupted(patch):
            return False, "green_corruption"
        
        # FIX: Check for NaN/Inf values that crash GPU during inference
        # These can occur after RTSP reconnects
        if np.isnan(frame).any():
            return False, "frame_contains_nan"
        if np.isinf(frame).any():
            return False, "frame_contains_inf"

        return True, "valid"

    def _is_green_corrupted(self, patch: np.ndarray) -> bool:
        """Detect green corruption common in H.264 decode errors.

        Operates on a pre-sampled patch for efficiency.
        """
        try:
            # Handle both uint8 (0-255) and float (0.0-1.0) frames
            b_mean = float(np.mean(patch[:, :, 0]))
            g_mean = float(np.mean(patch[:, :, 1]))
            r_mean = float(np.mean(patch[:, :, 2]))

            # Green corruption: green >> red and green >> blue
            # Thresholds work for uint8 range; scale for float if needed
            if g_mean > 200 and g_mean > b_mean * 2 and g_mean > r_mean * 2:
                return True

            # Purple/magenta corruption (missing green channel data)
            if r_mean > 150 and b_mean > 150 and g_mean < 50:
                return True

        except (cv2.error, ValueError, TypeError, OverflowError):
            pass

        return False

    def _record_frame(self, corrupted: bool) -> None:
        """Record frame capture for health tracking."""
        self._health_tracker.record_frame(time.time(), corrupted=corrupted)

    def _log_health_if_needed(self) -> None:
        """Log health metrics periodically."""
        now = time.time()
        if now - self._last_health_log >= CAMERA_HEALTH_LOG_INTERVAL_SECONDS:
            health = self._health_tracker.health
            logger.info(
                "[%s] Health: status=%s fps=%.1f corruption=%.1f%% reconnects=%d",
                self.zone_id,
                health.status,
                health.fps_actual,
                health.corruption_rate * 100,
                health.reconnect_count,
            )
            self._last_health_log = now
