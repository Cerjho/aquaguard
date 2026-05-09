import os
import json
import uuid
import pytest
import shutil
import cv2
import numpy as np
from datetime import datetime
from unittest.mock import MagicMock, patch

from detection_engine.clip.clip_capture_engine import ClipCaptureEngine
from detection_engine.pipeline.clip_buffer import ClipRingBuffer

@pytest.fixture
def mock_clips_dir():
    # Use an absolute path without spaces to avoid OpenCV VideoWriter failure
    clips_dir = os.path.abspath("./temp_test_clips")
    if os.path.exists(clips_dir):
        shutil.rmtree(clips_dir)
    os.makedirs(clips_dir, exist_ok=True)
    yield clips_dir
    if os.path.exists(clips_dir):
        shutil.rmtree(clips_dir)

@pytest.fixture
def mock_clip_buffer():
    buffer = ClipRingBuffer("zone1", buffer_size=10, frame_format='jpeg')
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    for i in range(5):
        buffer.write(frame, timestamp=float(i))
    return buffer

@pytest.fixture
def engine(mock_clips_dir, mock_clip_buffer):
    socketio_mock = MagicMock()
    mqtt_mock = MagicMock()
    engine = ClipCaptureEngine(
        clips_dir=mock_clips_dir,
        clip_buffers={"zone1": mock_clip_buffer},
        socketio=socketio_mock,
        mqtt_client=mqtt_mock
    )
    # Patch config dynamically for testing
    with patch('detection_engine.clip.clip_capture_engine.CLIP_POST_BUFFER_SECONDS', 0.1):
        yield engine
        engine.stop()

def test_clip_capture_engine_start_clip_success(engine, mock_clips_dir):
    engine.start()
    
    event_id = str(uuid.uuid4())
    track_id = "track_1"
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    original_replace = os.replace
    def fake_replace(src, dst):
        if dst.endswith('.mp4'):
            with open(dst, 'w') as f:
                f.write('fake video')
        else:
            original_replace(src, dst)
            
    with patch('detection_engine.clip.clip_capture_engine.CLIP_POST_BUFFER_SECONDS', 0.1), \
         patch('detection_engine.clip.clip_capture_engine.cv2.VideoWriter') as mock_vw, \
         patch('os.replace', side_effect=fake_replace):
        
        # Mock VideoWriter behavior
        mock_writer_instance = MagicMock()
        mock_writer_instance.isOpened.return_value = True
        mock_vw.return_value = mock_writer_instance
        
        clip_id = engine.start_clip("zone1", track_id, event_id, timestamp)
        assert clip_id is not None
        
        # Feed one post frame to ensure there's at least one
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        engine.feed_post_frame("zone1", frame)
        engine.add_frame_annotation("zone1", 0, timestamp, [{"behavior_score": 0.8}])
        
        # Wait for the post_deadline to expire and encoder to process
        import time
        time.sleep(1.0)
        
        zone_dir = os.path.join(mock_clips_dir, "pending", "zone1")
        assert os.path.exists(zone_dir)
        
        files = os.listdir(zone_dir)
        mp4_files = [f for f in files if f.endswith('.mp4')]
        json_files = [f for f in files if f.endswith('.json')]
        tmp_files = [f for f in files if f.endswith('.tmp')]
        
        assert len(mp4_files) == 1
        assert len(json_files) == 1
        assert len(tmp_files) == 0  # Atomic rename successful
        
        # Verify JSON
        with open(os.path.join(zone_dir, json_files[0]), 'r') as f:
            sidecar = json.load(f)
            
        assert sidecar['clip_id'] == clip_id
        assert sidecar['zone_id'] == "zone1"
        assert event_id in sidecar['event_ids']
        assert sidecar['trigger_timestamp_utc'] == timestamp
        assert sidecar['review']['status'] == 'pending'
        
        # Verify MP4
        mp4_path = os.path.join(zone_dir, mp4_files[0])
        assert os.path.getsize(mp4_path) > 0

def test_clip_capture_engine_startup_tmp_cleanup(mock_clips_dir, mock_clip_buffer):
    # Create a stale .tmp file
    os.makedirs(os.path.join(mock_clips_dir, "pending"), exist_ok=True)
    tmp_file = os.path.join(mock_clips_dir, "pending", "stale.mp4.tmp")
    with open(tmp_file, 'w') as f:
        f.write("stale")
        
    assert os.path.exists(tmp_file)
    
    # Engine initialization should clean it up
    engine = ClipCaptureEngine(
        clips_dir=mock_clips_dir,
        clip_buffers={"zone1": mock_clip_buffer}
    )
    
    assert not os.path.exists(tmp_file)

@patch('detection_engine.clip.clip_capture_engine.shutil.disk_usage')
def test_clip_capture_engine_disk_full_guard(mock_disk_usage, engine, caplog):
    # Mock free space to 0
    mock_usage = MagicMock()
    mock_usage.free = 0
    mock_disk_usage.return_value = mock_usage
    
    clip_id = engine.start_clip("zone1", "track_1", "event_1", "timestamp")
    
    assert clip_id is None
    assert "disk space below" in caplog.text

def test_clip_capture_engine_duplicate_zone_trigger(engine):
    event_id_1 = str(uuid.uuid4())
    event_id_2 = str(uuid.uuid4())
    
    with patch('detection_engine.clip.clip_capture_engine.CLIP_POST_BUFFER_SECONDS', 5.0):
        clip_id_1 = engine.start_clip("zone1", "track_1", event_id_1, "timestamp")
        assert clip_id_1 is not None
        
        # Second trigger within cooldown should return the same clip_id and extend
        clip_id_2 = engine.start_clip("zone1", "track_1", event_id_2, "timestamp")
        
        assert clip_id_1 == clip_id_2
        assert len(engine._active_clips["zone1"].event_ids) == 2
        assert event_id_1 in engine._active_clips["zone1"].event_ids
        assert event_id_2 in engine._active_clips["zone1"].event_ids
