"""Landmark dataclass — normalized MediaPipe pose landmark."""
from dataclasses import dataclass


@dataclass
class Landmark:
    """Single MediaPipe pose landmark with normalized coordinates (0.0–1.0)."""
    x: float          # normalized horizontal position
    y: float          # normalized vertical position (0=top, 1=bottom)
    z: float          # normalized depth
    visibility: float # confidence that landmark is visible [0.0, 1.0]
