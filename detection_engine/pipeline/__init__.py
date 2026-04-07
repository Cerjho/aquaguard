"""Multi-threaded detection pipeline — Three-Lane Highway architecture."""
from detection_engine.pipeline.frame_queue import FrameQueue
from detection_engine.pipeline.detection_worker import DetectionWorker
from detection_engine.pipeline.pipeline_manager import PipelineManager

__all__ = ['FrameQueue', 'DetectionWorker', 'PipelineManager']
