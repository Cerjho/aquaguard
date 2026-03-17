"""Shared pytest fixtures for detection_engine tests."""
import sys
import os

import numpy as np
import pytest

# Ensure repo root is on sys.path so `config` and `detection_engine` imports resolve
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


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
