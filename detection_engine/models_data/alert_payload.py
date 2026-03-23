"""AlertPayload dataclass — structured payload sent to MQTT and backend API."""
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass
class AlertPayload:
    """Alert event dispatched when drowning is confirmed."""
    event_id: str
    zone_id: str
    track_id: str
    score: float
    snapshot_path: str
    snapshot_b64: str     # JPEG frame encoded as base64 string
    timestamp: str        # ISO-8601 UTC timestamp
    bbox: Optional[Tuple[float, float, float, float]] = None
    class_label: str | None = None
    yolo_confidence: float | None = None
    pose_confidence: float | None = None
    final_confidence: float | None = None
