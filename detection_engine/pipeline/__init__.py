"""Multi-threaded detection pipeline — Three-Lane Highway architecture."""
from detection_engine.pipeline.frame_queue import (
    FrameQueue,
    PriorityFrameQueue,
    FramePriority,
)
from detection_engine.pipeline.detection_worker import DetectionWorker
from detection_engine.pipeline.pipeline_manager import PipelineManager
from detection_engine.pipeline.dashboard_buffer import DashboardRingBuffer
from detection_engine.pipeline.clip_buffer import ClipRingBuffer

__all__ = [
    'FrameQueue',
    'PriorityFrameQueue',
    'FramePriority',
    'DetectionWorker',
    'PipelineManager',
    'DashboardRingBuffer',
    'ClipRingBuffer',
]
