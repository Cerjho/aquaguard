"""Camera health metrics for monitoring and observability."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Optional
import threading


CameraStatus = Literal['online', 'degraded', 'offline', 'connecting']


@dataclass
class CameraHealth:
    """Real-time health metrics for a camera stream."""

    zone_id: str
    status: CameraStatus = 'offline'
    fps_actual: float = 0.0
    fps_target: float = 30.0
    corruption_rate: float = 0.0
    last_frame_at: Optional[datetime] = None
    reconnect_count: int = 0
    uptime_seconds: float = 0.0
    total_frames: int = 0
    corrupted_frames: int = 0
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        """Serialize health metrics for API/MQTT."""
        return {
            'zone_id': self.zone_id,
            'status': self.status,
            'fps_actual': round(self.fps_actual, 2),
            'fps_target': self.fps_target,
            'corruption_rate': round(self.corruption_rate, 4),
            'last_frame_at': self.last_frame_at.isoformat() if self.last_frame_at else None,
            'reconnect_count': self.reconnect_count,
            'uptime_seconds': round(self.uptime_seconds, 1),
            'total_frames': self.total_frames,
            'corrupted_frames': self.corrupted_frames,
            'error_message': self.error_message,
            'started_at': self.started_at.isoformat() if self.started_at else None,
        }


class HealthTracker:
    """Thread-safe health metrics tracker for a camera."""

    def __init__(self, zone_id: str, fps_target: float = 30.0):
        self._health = CameraHealth(zone_id=zone_id, fps_target=fps_target)
        self._lock = threading.Lock()
        self._frame_timestamps: list[float] = []
        self._fps_window_seconds = 5.0
        self._on_status_change = None

    @property
    def health(self) -> CameraHealth:
        """Return a snapshot of current health metrics."""
        with self._lock:
            return CameraHealth(
                zone_id=self._health.zone_id,
                status=self._health.status,
                fps_actual=self._health.fps_actual,
                fps_target=self._health.fps_target,
                corruption_rate=self._health.corruption_rate,
                last_frame_at=self._health.last_frame_at,
                reconnect_count=self._health.reconnect_count,
                uptime_seconds=self._health.uptime_seconds,
                total_frames=self._health.total_frames,
                corrupted_frames=self._health.corrupted_frames,
                error_message=self._health.error_message,
                started_at=self._health.started_at,
            )

    def start(self) -> None:
        """Mark camera as starting."""
        with self._lock:
            self._health.started_at = datetime.now(timezone.utc)
            prev_status = self._health.status
            self._health.status = 'connecting'
            self._health.error_message = None
        self._notify_status_change(prev_status, 'connecting', 'starting')

    def connected(self) -> None:
        """Mark camera as successfully connected."""
        with self._lock:
            prev_status = self._health.status
            self._health.status = 'online'
            self._health.error_message = None
            if self._health.started_at is None:
                self._health.started_at = datetime.now(timezone.utc)
        self._notify_status_change(prev_status, 'online', 'connected')

    def disconnected(self, error: Optional[str] = None) -> None:
        """Mark camera as disconnected."""
        with self._lock:
            prev_status = self._health.status
            self._health.status = 'offline'
            self._health.error_message = error
            self._health.fps_actual = 0.0
        self._notify_status_change(prev_status, 'offline', error or 'disconnected')

    def reconnecting(self) -> None:
        """Mark camera as attempting reconnection."""
        with self._lock:
            prev_status = self._health.status
            self._health.status = 'connecting'
            self._health.reconnect_count += 1
        self._notify_status_change(prev_status, 'connecting', 'reconnecting')

    def _notify_status_change(self, old_status: str, new_status: str, reason: str) -> None:
        """Notify listeners of status change (for MQTT publishing)."""
        if old_status != new_status and self._on_status_change:
            try:
                self._on_status_change(self._health.zone_id, new_status, reason, self.health)
            except Exception:
                pass

    def set_status_callback(self, callback) -> None:
        """Set callback for status changes: callback(zone_id, status, reason, health)."""
        self._on_status_change = callback

    def record_frame(self, timestamp: float, corrupted: bool = False) -> None:
        """Record a frame capture event."""
        with self._lock:
            self._health.total_frames += 1
            self._health.last_frame_at = datetime.now(timezone.utc)

            if corrupted:
                self._health.corrupted_frames += 1

            # Update FPS calculation
            self._frame_timestamps.append(timestamp)
            cutoff = timestamp - self._fps_window_seconds
            self._frame_timestamps = [t for t in self._frame_timestamps if t > cutoff]

            if len(self._frame_timestamps) >= 2:
                duration = self._frame_timestamps[-1] - self._frame_timestamps[0]
                if duration > 0:
                    self._health.fps_actual = (len(self._frame_timestamps) - 1) / duration

            # Update corruption rate
            if self._health.total_frames > 0:
                self._health.corruption_rate = (
                    self._health.corrupted_frames / self._health.total_frames
                )

            # Update uptime
            if self._health.started_at:
                self._health.uptime_seconds = (
                    datetime.now(timezone.utc) - self._health.started_at
                ).total_seconds()

            # Determine status based on metrics
            self._update_status()

    def _update_status(self) -> None:
        """Update status based on current metrics (called with lock held)."""
        if self._health.status == 'offline':
            return

        fps_ratio = (
            self._health.fps_actual / self._health.fps_target
            if self._health.fps_target > 0
            else 1.0
        )

        if fps_ratio < 0.5 or self._health.corruption_rate > 0.10:
            self._health.status = 'degraded'
        else:
            self._health.status = 'online'

    def reset_frame_stats(self) -> None:
        """Reset frame statistics for a new measurement interval."""
        with self._lock:
            self._health.total_frames = 0
            self._health.corrupted_frames = 0
            self._health.corruption_rate = 0.0
            self._frame_timestamps.clear()
