import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClipPlayer from '../ClipPlayer';
import useClipsApi from '../../../hooks/useClipsApi';

// Mock the API hook
jest.mock('../../../hooks/useClipsApi');

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock canvas getContext
const mockCtx = {
  clearRect: jest.fn(),
  strokeRect: jest.fn(),
  fillRect: jest.fn(),
};
HTMLCanvasElement.prototype.getContext = () => mockCtx;

describe('ClipPlayer', () => {
  const mockGetClipStreamUrl = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    useClipsApi.mockReturnValue({ getClipStreamUrl: mockGetClipStreamUrl });
    mockGetClipStreamUrl.mockReturnValue('http://localhost/stream/clip123');
    
    // Reset mockCtx
    mockCtx.clearRect.mockClear();
    mockCtx.strokeRect.mockClear();
    mockCtx.fillRect.mockClear();
  });

  it('renders video element with correct stream url and attributes', () => {
    const { container } = render(<ClipPlayer clipId="clip123" metadata={{}} />);
    
    expect(mockGetClipStreamUrl).toHaveBeenCalledWith('clip123');
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', 'http://localhost/stream/clip123');
    expect(video).toHaveAttribute('crossOrigin', 'use-credentials');
  });

  it('renders bounding box timeline based on annotations', () => {
    const metadata = {
      fps: 30,
      duration_seconds: 1,
      per_frame_annotations: [
        { frame_index: 0, confidence: 0.1, alert_triggered: false },
        { frame_index: 15, confidence: 0.9, alert_triggered: true }
      ]
    };
    
    const { container } = render(<ClipPlayer clipId="clip123" metadata={metadata} />);
    
    // The timeline should have 2 bars
    const timelineContainer = container.querySelector('.bg-slate-800');
    expect(timelineContainer).toBeInTheDocument();
    
    const bars = timelineContainer.querySelectorAll('.flex-1');
    expect(bars.length).toBe(2);
    expect(bars[0]).toHaveClass('bg-blue-400');
    expect(bars[1]).toHaveClass('bg-rose-500');
  });

  it('handles video error state', () => {
    render(<ClipPlayer clipId="clip123" metadata={{}} />);
    const video = document.querySelector('video');
    
    act(() => {
      const event = new Event('error');
      video.dispatchEvent(event);
    });
    
    expect(screen.getByText('Video playback failed')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeInTheDocument();
  });

  it('computes correct bounding box coordinates for letterboxed video', () => {
    const metadata = {
      fps: 30,
      duration_seconds: 1,
      per_frame_annotations: [
        { 
          frame_index: 0, 
          confidence: 0.9, 
          alert_triggered: true,
          bounding_boxes: [{ coords: [0.1, 0.1, 0.9, 0.9] }]
        }
      ]
    };
    
    const { container } = render(<ClipPlayer clipId="clip123" metadata={metadata} />);
    const video = container.querySelector('video');
    
    // Mock dimensions directly on the video instance
    Object.defineProperty(video, 'clientWidth', { get: () => 800, configurable: true });
    Object.defineProperty(video, 'clientHeight', { get: () => 800, configurable: true });
    Object.defineProperty(video, 'videoWidth', { get: () => 800, configurable: true });
    Object.defineProperty(video, 'videoHeight', { get: () => 400, configurable: true });
    
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.currentTime = 0.01;
      video.dispatchEvent(new Event('seeked'));
    });
    
    // Scale X = 800 / 800 = 1
    // Scale Y = 800 / 400 = 2
    // Scale = Math.min(1, 2) = 1
    // Render Width = 800 * 1 = 800
    // Render Height = 400 * 1 = 400
    // Offset X = (800 - 800) / 2 = 0
    // Offset Y = (800 - 400) / 2 = 200
    // x1 = 0.1, y1 = 0.1, x2 = 0.9, y2 = 0.9
    // left = 0 + 0.1 * 800 = 80
    // top = 200 + 0.1 * 400 = 240
    // width = (0.9 - 0.1) * 800 = 640
    // height = (0.9 - 0.1) * 400 = 320
    
    // The effect runs on mount and again when we triggered loadedmetadata
    expect(mockCtx.strokeRect).toHaveBeenLastCalledWith(80, 240, 640, 320);
  });

  it('computes correct bounding box coordinates for pillarboxed video', () => {
    const metadata = {
      fps: 30,
      duration_seconds: 1,
      per_frame_annotations: [
        { 
          frame_index: 0, 
          confidence: 0.9, 
          alert_triggered: true,
          bounding_boxes: [{ coords: [0.1, 0.1, 0.9, 0.9] }]
        }
      ]
    };
    
    const { container } = render(<ClipPlayer clipId="clip123" metadata={metadata} />);
    const video = container.querySelector('video');
    
    // Mock dimensions directly on the video instance
    Object.defineProperty(video, 'clientWidth', { get: () => 800, configurable: true });
    Object.defineProperty(video, 'clientHeight', { get: () => 800, configurable: true });
    Object.defineProperty(video, 'videoWidth', { get: () => 400, configurable: true });
    Object.defineProperty(video, 'videoHeight', { get: () => 800, configurable: true });
    
    act(() => {
      video.dispatchEvent(new Event('loadedmetadata'));
      video.currentTime = 0.01;
      video.dispatchEvent(new Event('seeked'));
    });
    
    // Scale X = 800 / 400 = 2
    // Scale Y = 800 / 800 = 1
    // Scale = Math.min(2, 1) = 1
    // Render Width = 400 * 1 = 400
    // Render Height = 800 * 1 = 800
    // Offset X = (800 - 400) / 2 = 200
    // Offset Y = (800 - 800) / 2 = 0
    // x1 = 0.1, y1 = 0.1, x2 = 0.9, y2 = 0.9
    // left = 200 + 0.1 * 400 = 240
    // top = 0 + 0.1 * 800 = 80
    // width = (0.9 - 0.1) * 400 = 320
    // height = (0.9 - 0.1) * 800 = 640
    
    expect(mockCtx.strokeRect).toHaveBeenLastCalledWith(240, 80, 320, 640);
  });
});
