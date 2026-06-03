import pytest
import time
import numpy as np
import threading
from detection_engine.pipeline.clip_buffer import ClipRingBuffer


@pytest.fixture
def mock_frame():
    # A small black 10x10 BGR frame
    return np.zeros((10, 10, 3), dtype=np.uint8)


def test_clip_ring_buffer_write_read_cycle(mock_frame):
    buffer = ClipRingBuffer(zone_id="zone1", buffer_size=10, frame_format='raw')

    # Write 5 frames
    for i in range(5):
        buffer.write(mock_frame, timestamp=float(i))

    assert buffer.total_writes == 5
    assert not buffer.is_empty

    snapshot = buffer.snapshot()
    assert len(snapshot) == 5

    # Check order and timestamps
    for i in range(5):
        frame, ts = snapshot[i]
        assert ts == float(i)
        assert isinstance(frame, np.ndarray)


def test_clip_ring_buffer_overflow_eviction(mock_frame):
    buffer = ClipRingBuffer(zone_id="zone1", buffer_size=5, frame_format='raw')

    # Write 8 frames into a buffer of size 5
    for i in range(8):
        buffer.write(mock_frame, timestamp=float(i))

    assert buffer.total_writes == 8

    snapshot = buffer.snapshot()
    assert len(snapshot) == 5

    # The oldest 3 frames should be evicted. We expect timestamps 3, 4, 5, 6, 7
    expected_ts = [3.0, 4.0, 5.0, 6.0, 7.0]
    for i in range(5):
        frame, ts = snapshot[i]
        assert ts == expected_ts[i]


def test_clip_ring_buffer_thread_safety(mock_frame):
    buffer = ClipRingBuffer(zone_id="zone1", buffer_size=1000, frame_format='raw')

    def writer_thread(start_ts, count):
        for i in range(count):
            buffer.write(mock_frame, timestamp=float(start_ts + i))

    # Run 2 concurrent writers
    t1 = threading.Thread(target=writer_thread, args=(0, 500))
    t2 = threading.Thread(target=writer_thread, args=(1000, 500))

    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert buffer.total_writes == 1000
    snapshot = buffer.snapshot()
    assert len(snapshot) == 1000


def test_clip_ring_buffer_jpeg_compression(mock_frame):
    buffer = ClipRingBuffer(zone_id="zone1", buffer_size=5, frame_format='jpeg')
    buffer.write(mock_frame, timestamp=1.0)

    snapshot = buffer.snapshot()
    assert len(snapshot) == 1

    frame_data, ts = snapshot[0]
    assert isinstance(frame_data, bytes)
    # Check JPEG header
    assert frame_data.startswith(b'\xff\xd8')


def test_clip_ring_buffer_empty_snapshot():
    buffer = ClipRingBuffer(zone_id="zone1", buffer_size=5)

    assert buffer.is_empty
    snapshot = buffer.snapshot()
    assert snapshot == []


def test_clip_ring_buffer_config_capacity():
    buffer = ClipRingBuffer(zone_id="zone1", buffer_size=240)
    assert buffer.buffer_size == 240
