#!/usr/bin/env python3
"""
Memory optimization utilities for AquaGuard detection engine.
Prevents GPU memory leaks from model inference and frame buffering.
"""

import gc
import torch
import logging

logger = logging.getLogger(__name__)


class GPUMemoryManager:
    """Manage GPU memory to prevent leaks during continuous inference."""
    
    @staticmethod
    def clear_cache():
        """Clear GPU cache after each inference batch."""
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()
    
    @staticmethod
    def get_gpu_memory_info():
        """Return dict of GPU memory stats."""
        if not torch.cuda.is_available():
            return {'available': 0, 'allocated': 0, 'reserved': 0}
        
        return {
            'available': torch.cuda.mem_get_info()[0] / 1e9,  # GB
            'allocated': torch.cuda.memory_allocated() / 1e9,
            'reserved': torch.cuda.memory_reserved() / 1e9,
        }
    
    @staticmethod
    def log_memory_stats(prefix=''):
        """Log current GPU memory usage."""
        if not torch.cuda.is_available():
            return
        
        stats = GPUMemoryManager.get_gpu_memory_info()
        logger.info(
            '%s GPU Memory - Available: %.2fGB, Allocated: %.2fGB, Reserved: %.2fGB',
            prefix,
            stats['available'],
            stats['allocated'],
            stats['reserved'],
        )


class FrameBuffer:
    """Pre-allocated frame buffer pool to avoid continuous memory allocation."""
    
    def __init__(self, capacity=100, frame_shape=(480, 640, 3)):
        self.capacity = capacity
        self.frame_shape = frame_shape
        self.frames = []
        self.available = True
    
    def get_frame_buffer(self):
        """Get a pre-allocated frame buffer."""
        import numpy as np
        if self.available:
            if not self.frames:
                self.frames = [np.zeros(self.frame_shape, dtype=np.uint8) for _ in range(self.capacity)]
            return self.frames.pop() if self.frames else np.zeros(self.frame_shape, dtype=np.uint8)
        return None
    
    def return_frame_buffer(self, frame):
        """Return frame to pool for reuse."""
        if len(self.frames) < self.capacity and self.available:
            self.frames.append(frame)


def cleanup_on_exit():
    """Call on application shutdown to clean up resources."""
    logger.info('Cleaning up GPU memory...')
    GPUMemoryManager.clear_cache()
    gc.collect()
    logger.info('GPU memory cleanup complete')
