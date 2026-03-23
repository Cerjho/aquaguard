"""Shared pytest fixtures for detection_engine tests."""
import numpy as np
import pytest


# ── Reusable fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def blank_frame():
    """480x640 black BGR frame."""
    return np.zeros((480, 640, 3), dtype=np.uint8)


@pytest.fixture
def dummy_landmarks():
    """33 MediaPipe-style Landmark objects with neutral normalized coordinates."""
    from detection_engine.models_data.landmark import Landmark

    landmarks = []
    for i in range(33):
        # Body roughly upright: shoulders at y≈0.3, hips at y≈0.6
        x = 0.5
        y = 0.3 + (i / 33) * 0.4
        landmarks.append(Landmark(x=x, y=y, z=0.0, visibility=0.9))
    return landmarks
