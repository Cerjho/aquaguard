import React, { useRef, useState, useEffect, useMemo } from 'react';
import useClipsApi from '../../hooks/useClipsApi';
import PremiumLoader from '../layout/PremiumLoader.jsx';

function ClipPlayer({ clipId, metadata }) {
  const { getClipStreamUrl } = useClipsApi();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const streamUrl = useMemo(() => getClipStreamUrl(clipId), [clipId, getClipStreamUrl]);

  const annotations = metadata?.per_frame_annotations || [];
  
  // Find closest frame annotation
  const activeAnnotation = useMemo(() => {
    if (!annotations.length) return null;
    const fps = metadata?.fps || 30; // Sidecar provides fps, fallback to 30
    const frameIndex = Math.round(currentTime * fps);
    
    // Optimistic direct access if array is contiguous
    if (annotations[frameIndex] && annotations[frameIndex].frame_index === frameIndex) {
      return annotations[frameIndex];
    }
    // Fallback search
    return annotations.find(a => a.frame_index === frameIndex) || null;
  }, [currentTime, annotations, metadata]);

  useEffect(() => {
    let animationFrameId;
    const syncTime = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
      animationFrameId = requestAnimationFrame(syncTime);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(syncTime);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!containerRef.current || !videoRef.current || !canvasRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    });
    
    resizeObserver.observe(containerRef.current);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleLoadedMetadata = () => {
    if (videoRef.current && canvasRef.current) {
      canvasRef.current.width = videoRef.current.clientWidth;
      canvasRef.current.height = videoRef.current.clientHeight;
    }
  };

  const handleSeeked = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const video = videoRef.current;
    if (!video) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!activeAnnotation || !activeAnnotation.bounding_boxes) return;

    activeAnnotation.bounding_boxes.forEach((bbox) => {
      const [x1, y1, x2, y2] = bbox.coords;
      // Using normalized coordinates. If bounding boxes are absolute pixel values,
      // scaleX = canvas.width / video.videoWidth would be needed. 
      // But sidecar has normalized coords (0-1).
      const scaleX = canvas.width / (video.videoWidth || 1);
      const scaleY = canvas.height / (video.videoHeight || 1);
      const scale = Math.min(scaleX, scaleY);
      
      const renderWidth = (video.videoWidth || 1) * scale;
      const renderHeight = (video.videoHeight || 1) * scale;
      
      const offsetX = (canvas.width - renderWidth) / 2;
      const offsetY = (canvas.height - renderHeight) / 2;

      let left = offsetX + x1 * renderWidth;
      let top = offsetY + y1 * renderHeight;
      let width = (x2 - x1) * renderWidth;
      let height = (y2 - y1) * renderHeight;

      ctx.strokeStyle = 'rgba(244, 63, 94, 1)'; // rose-500
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
      
      ctx.strokeRect(left, top, width, height);
      ctx.fillRect(left, top, width, height);
    });
  }, [activeAnnotation, currentTime]);

  if (videoError) {
    return (
      <div className="flex flex-col items-center justify-center text-slate-500 p-10 h-full w-full aspect-video bg-slate-900 rounded-2xl">
        <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm font-medium">Video playback failed</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 rounded-2xl overflow-hidden relative group">
      {/* Video Container */}
      <div className="relative flex-1 flex items-center justify-center w-full aspect-video bg-black" ref={containerRef}>
        <video
          ref={videoRef}
          src={streamUrl}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onSeeked={handleSeeked}
          onError={() => setVideoError(true)}
          muted
          playsInline
          crossOrigin="use-credentials"
          className="w-full h-full object-contain"
        />
        
        {/* Buffering Overlay */}
        {isBuffering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <PremiumLoader />
          </div>
        )}

        {/* Bounding Box Overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
        />
      </div>
      
      {/* Timeline / Confidence Graph */}
      {annotations.length > 0 && (
        <div className="h-12 w-full bg-slate-800 relative border-t border-slate-700">
          <div className="absolute inset-0 flex items-end opacity-50">
            {annotations.map((ann, i) => {
              const height = (ann.confidence || 0) * 100;
              return (
                <div 
                  key={i} 
                  className={`flex-1 mx-[1px] rounded-t-sm ${ann.alert_triggered ? 'bg-rose-500' : 'bg-blue-400'}`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
          {/* Progress Indicator */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10"
            style={{ 
              left: `${(currentTime / (metadata?.duration_seconds || 1)) * 100}%`,
              transition: 'left 0.1s linear'
            }}
          />
        </div>
      )}
    </div>
  );
}

export default ClipPlayer;
