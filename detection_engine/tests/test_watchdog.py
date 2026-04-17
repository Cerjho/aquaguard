"""Unit tests for watchdog shutdown behavior."""

import signal

import pytest

from detection_engine.watchdog import DetectionEngineWatchdog


def test_handle_shutdown_sets_flag_and_interrupts(monkeypatch):
    monkeypatch.setattr(signal, "signal", lambda *_args, **_kwargs: None)
    watchdog = DetectionEngineWatchdog()

    with pytest.raises(KeyboardInterrupt):
        watchdog._handle_shutdown(signal.SIGTERM, None)

    assert watchdog.shutdown_requested is True
