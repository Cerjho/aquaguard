"""Unit tests for frame writer pre-allocated buffers and race conditions (Fix #4)."""
import threading
import time
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from detection_engine.camera.frame_writer import ContinuousFrameWriter


class TestFrameWriterBufferPreallocation:
    """Verify buffers are pre-allocated once, not allocated per-frame."""

    def test_buffers_preallocated_at_init(self):
        """Buffers should be allocated once in __init__."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        # Assert: raw frame buffer is allocated
        assert writer._frame_buffer_raw is not None
        assert isinstance(writer._frame_buffer_raw, np.ndarray)
        assert writer._frame_buffer_raw.shape == (1080, 1920, 3)
        assert writer._frame_buffer_raw.dtype == np.uint8
        
        # Assert: annotated frame buffer is allocated
        assert writer._frame_buffer_annotated is not None
        assert isinstance(writer._frame_buffer_annotated, np.ndarray)
        assert writer._frame_buffer_annotated.shape == (1080, 1920, 3)
        assert writer._frame_buffer_annotated.dtype == np.uint8

    def test_same_buffers_reused_on_multiple_updates(self):
        """Multiple update_raw_frame() calls reuse the same buffer."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        buffer_id_1 = id(writer._frame_buffer_raw)
        
        # Update frame 10 times
        for i in range(10):
            frame = np.full((1080, 1920, 3), fill_value=i, dtype=np.uint8)
            writer.update_raw_frame(frame)
            buffer_id_now = id(writer._frame_buffer_raw)
            # Assert: same buffer object (not a new allocation)
            assert buffer_id_now == buffer_id_1

    def test_no_per_frame_allocation_with_copyto(self):
        """np.copyto() should be used (not frame.copy())."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        test_frame = np.ones((1080, 1920, 3), dtype=np.uint8)
        
        with patch("numpy.copyto") as mock_copyto:
            writer.update_raw_frame(test_frame)
            # Assert: np.copyto was called
            mock_copyto.assert_called_once()
            
            # Verify it was called with correct args
            call_args = mock_copyto.call_args
            assert call_args[0][0] is writer._frame_buffer_raw  # dest
            # assert call_args[0][1] is test_frame  # src


class TestFrameWriterRaceCondition:
    """Verify no race condition when updating and reading frames concurrently."""

    def test_no_frame_tearing_with_concurrent_updates(self):
        """
        Concurrent updates should not cause mixed old+new frame data.
        
        This is the critical race condition test:
        - Thread 1: Updates buffer 100 times with unique values
        - Thread 2: Reads buffer and verifies all pixels have same value
        - Expected: No mixing (no "tearing")
        """
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        # Track any corruptions detected
        corruptions = []
        
        def updater():
            """Continuously update buffer with unique values."""
            for i in range(100):
                value = (i % 256)
                frame = np.full((1080, 1920, 3), fill_value=value, dtype=np.uint8)
                writer.update_raw_frame(frame)
                time.sleep(0.001)  # 1ms between updates
        
        def reader():
            """Continuously read and check for corruption."""
            for _ in range(100):
                with writer._frame_lock:
                    buf = writer._latest_raw_frame
                    if buf is not None:
                        unique_values = set(buf.flatten())
                        if len(unique_values) > 1:
                            # Corruption: multiple values in single frame
                            corruptions.append(unique_values)
                time.sleep(0.001)
        
        t1 = threading.Thread(target=updater, daemon=True)
        t2 = threading.Thread(target=reader, daemon=True)
        
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)
        
        # Assert: no tearing detected
        assert len(corruptions) == 0, f"Frame tearing detected: {len(corruptions)} corrupt frames"

    def test_buffer_ownership_not_aliased_to_opencv(self):
        """
        Writer should own buffers, not reference OpenCV's reusable buffers.
        
        If we stored references to OpenCV's buffers, subsequent cap.read()
        calls would overwrite them while we're encoding (race condition).
        """
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        # Create frame with pattern 1
        frame1 = np.full((1080, 1920, 3), fill_value=100, dtype=np.uint8)
        writer.update_raw_frame(frame1)
        
        # Snapshot the stored frame
        stored_snapshot = writer._latest_raw_frame.copy()
        
        # Simulate OpenCV reusing the input buffer (modifying frame1 in-place)
        frame1[:] = 200
        
        # Assert: stored frame is unchanged (we own a separate buffer)
        assert np.array_equal(stored_snapshot, 100), \
            "Buffer was overwritten by input modification (aliasing issue)"

    def test_concurrent_update_and_read_locks_correctly(self):
        """Thread lock prevents interleaving of update and read operations."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        lock_operations = []
        
        def locked_update():
            """Perform updates with lock."""
            for i in range(10):
                with writer._frame_lock:
                    lock_operations.append(("update_start", i))
                    time.sleep(0.002)  # Hold lock for 2ms
                    lock_operations.append(("update_end", i))
        
        def locked_read():
            """Perform reads with lock."""
            for i in range(10):
                with writer._frame_lock:
                    lock_operations.append(("read_start", i))
                    time.sleep(0.002)  # Hold lock for 2ms
                    lock_operations.append(("read_end", i))
        
        t1 = threading.Thread(target=locked_update, daemon=True)
        t2 = threading.Thread(target=locked_read, daemon=True)
        
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)
        
        # Verify no interleaving: between "start" and "end", there should be no
        # operations from the other thread
        for i in range(len(lock_operations) - 1):
            op_type, op_id = lock_operations[i]
            next_op_type, next_op_id = lock_operations[i + 1]
            
            # If this is a "start", the next op should complete before switching threads
            if op_type.endswith("_start"):
                # The corresponding "end" should be next (or very close)
                # Strict check: next op should be same thread's end
                if next_op_type.endswith("_start"):
                    # Interleaving detected
                    pytest.fail(f"Lock interleaving: {op_type} followed by {next_op_type}")


class TestFrameWriterShapeHandling:
    """Verify graceful handling of resolution mismatches."""

    def test_shape_mismatch_logged_as_warning(self, caplog):
        """If frame shape doesn't match buffer, log warning but don't crash."""
        import logging
        
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        # First update with correct shape (ok)
        frame1 = np.zeros((1080, 1920, 3), dtype=np.uint8)
        writer.update_raw_frame(frame1)
        assert writer._latest_raw_frame is not None
        
        # Second update with different shape (should warn)
        frame2 = np.zeros((720, 1280, 3), dtype=np.uint8)  # Different resolution
        
        with caplog.at_level(logging.WARNING):
            writer.update_raw_frame(frame2)
        
        # Assert: warning was logged
        assert "shape mismatch" in caplog.text.lower() or "mismatch" in caplog.text.lower(), \
            "Warning should be logged for shape mismatch"

    def test_shape_mismatch_does_not_crash(self):
        """Shape mismatch should not raise exception."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        # Correct shape
        frame1 = np.zeros((1080, 1920, 3), dtype=np.uint8)
        writer.update_raw_frame(frame1)
        
        # Mismatched shape
        frame2 = np.zeros((720, 1280, 3), dtype=np.uint8)
        
        # Should not raise
        try:
            writer.update_raw_frame(frame2)
        except Exception as e:
            pytest.fail(f"Shape mismatch raised exception: {e}")


class TestFrameWriterCopyTo:
    """Verify np.copyto() is used correctly."""

    def test_copyto_copies_data_not_reference(self):
        """np.copyto() should copy pixel data, not store a reference."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        # Create a frame with specific pattern
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        frame[0:100, 0:100, :] = 255
        
        writer.update_raw_frame(frame)
        
        # Modify the input frame
        frame[:] = 0
        
        # Assert: stored frame is unchanged (data was copied)
        stored = writer._latest_raw_frame
        assert stored[0, 0, 0] == 255, "Stored frame should be unchanged after modifying input"

    def test_copyto_preserves_dtype(self):
        """np.copyto() should preserve uint8 dtype."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        frame = np.ones((1080, 1920, 3), dtype=np.uint8) * 100
        writer.update_raw_frame(frame)
        
        stored = writer._latest_raw_frame
        assert stored.dtype == np.uint8
        assert np.all(stored == 100)


class TestFrameWriterThreadSafety:
    """Verify thread-safe access to frames."""

    def test_multiple_threads_reading_frame_safely(self):
        """Multiple reader threads should not interfere."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        test_frame = np.full((1080, 1920, 3), fill_value=42, dtype=np.uint8)
        writer.update_raw_frame(test_frame)
        
        read_results = []
        
        def reader():
            for _ in range(10):
                with writer._frame_lock:
                    buf = writer._latest_raw_frame
                    if buf is not None:
                        value = buf[0, 0, 0]
                        read_results.append(value)
                time.sleep(0.001)
        
        threads = [threading.Thread(target=reader, daemon=True) for _ in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        
        # Assert: all reads got the same value
        assert all(v == 42 for v in read_results), "All reads should see consistent value"

    def test_update_while_reading_no_exception(self):
        """Updating while reading should not raise exception."""
        writer = ContinuousFrameWriter("zone_1", "/tmp/test", target_fps=30)
        
        exceptions = []
        
        def updater():
            try:
                for i in range(50):
                    frame = np.full((1080, 1920, 3), fill_value=i, dtype=np.uint8)
                    writer.update_raw_frame(frame)
                    time.sleep(0.001)
            except Exception as e:
                exceptions.append(("updater", e))
        
        def reader():
            try:
                for _ in range(50):
                    with writer._frame_lock:
                        buf = writer._latest_raw_frame
                    time.sleep(0.001)
            except Exception as e:
                exceptions.append(("reader", e))
        
        t1 = threading.Thread(target=updater, daemon=True)
        t2 = threading.Thread(target=reader, daemon=True)
        
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)
        
        # Assert: no exceptions
        assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
