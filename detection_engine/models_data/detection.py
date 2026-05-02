"""Detection dataclass — one instance per YOLO bounding box detection."""
from dataclasses import dataclass
from typing import Optional, Tuple


@dataclass
class Detection:
    """Represents a single YOLO detection result."""
    track_id: str
    class_label: str          # "drowning" | "swimming" | "person_out_of_water"
    confidence: float
    bbox: Tuple[float, float, float, float]  # (x1, y1, x2, y2)
    zone_id: Optional[str] = None
    behavior_score: float = 0.0  # Populated by detection worker after pose+behavior analysis

