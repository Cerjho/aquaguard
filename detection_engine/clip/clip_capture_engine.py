"""
Clip Capture Engine — orchestrates drowning event clip recording.

Lifecycle:
  1. ``start_clip(zone_id, event_id, ...)`` is called when a confirmed
     drowning alert fires (after confidence_filter + alert_engine gate).
  2. The engine snapshots the pre-buffer (8s of JPEG frames) from the
     zone's ClipRingBuffer immediately.
  3. A post-event timer collects additional frames for CLIP_POST_BUFFER_SECONDS.
  4. On timer expiry, the clip is finalized: JPEG frames are decoded to BGR,
     written to an H.264 MP4 via cv2.VideoWriter, and a JSON sidecar is
     emitted alongside the video file.
  5. SocketIO ``clip_ready`` event is emitted after sidecar write (Rule R6-D).

Thread safety:
  - Each zone's clip state is independent (mirrors Rule R6-A).
  - MP4 encoding runs in a bounded ThreadPoolExecutor (CPU-only, no GPU).
  - The engine never blocks the detection hot path.

Disk safety:
  - Pre-checks disk space via shutil.disk_usage() before writing.
  - Writes to .tmp file, atomically renames on completion.
  - Incomplete .tmp files are cleaned up on startup.
"""
import json
import logging
import os
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np

from config.settings import (
    CLIP_POST_BUFFER_SECONDS,
    CLIP_VIDEO_FPS,
    CLIP_MIN_FREE_DISK_GB,
    CLIP_MAX_PER_HOUR,
    CLIP_JPEG_QUALITY,
)

logger = logging.getLogger(__name__)

# Maximum concurrent MP4 encode jobs (CPU-only, bounded memory)
_MAX_ENCODE_WORKERS = 2
_MAX_ENCODE_BACKLOG = 8


class _ZoneClipState:
    """Mutable state for an in-progress clip recording in a single zone."""

    __slots__ = (
        'clip_id', 'zone_id', 'event_ids', 'track_ids',
        'trigger_timestamp', 'pre_frames', 'post_frames',
        'post_deadline', 'is_recording_post', 'annotations',
    )

    def __init__(
        self,
        clip_id: str,
        zone_id: str,
        event_id: str,
        track_id: str,
        trigger_timestamp: str,
        pre_frames: List[Tuple[bytes, float]],
    ):
        self.clip_id = clip_id
        self.zone_id = zone_id
        self.event_ids: List[str] = [event_id]
        self.track_ids: List[str] = [track_id]
        self.trigger_timestamp = trigger_timestamp
        self.pre_frames = pre_frames
        self.post_frames: List[Tuple[bytes, float]] = []
        self.post_deadline = time.monotonic() + CLIP_POST_BUFFER_SECONDS
        self.is_recording_post = True
        self.annotations: List[Dict[str, Any]] = []


class ClipCaptureEngine:
    """Orchestrates drowning event clip recording across all camera zones.

    One instance for the entire detection engine.  Per-zone state is
    kept in ``_active_clips`` keyed by zone_id.
    """

    def __init__(
        self,
        clips_dir: str,
        clip_buffers: Dict[str, Any],  # zone_id → ClipRingBuffer
        socketio: Optional[Any] = None,
        mqtt_client: Optional[Any] = None,
    ):
        self._clips_dir = clips_dir
        self._clip_buffers = clip_buffers
        self._socketio = socketio
        self._mqtt_client = mqtt_client

        # Per-zone active clip state
        self._active_clips: Dict[str, _ZoneClipState] = {}
        self._lock = threading.Lock()

        # Per-zone hourly rate tracking: zone_id → list of epoch timestamps
        self._clip_timestamps: Dict[str, List[float]] = {}

        # Background MP4 encoder pool
        self._encoder_pool = ThreadPoolExecutor(
            max_workers=_MAX_ENCODE_WORKERS,
            thread_name_prefix='clip-encoder',
        )
        self._pending_encodes = 0
        self._pending_lock = threading.Lock()

        # Post-event collection thread
        self._stop_event = threading.Event()
        self._post_thread: Optional[threading.Thread] = None

        # Ensure clip directories exist
        for folder in ('pending', 'confirmed', 'dismissed'):
            os.makedirs(os.path.join(self._clips_dir, folder), exist_ok=True)

        # Cleanup stale .tmp files from previous crashes
        self._cleanup_tmp_files()

        self._closed = False

    def start(self) -> None:
        """Start the post-event collection monitor thread."""
        if self._post_thread is not None and self._post_thread.is_alive():
            return

        self._stop_event.clear()
        self._post_thread = threading.Thread(
            target=self._post_event_monitor,
            name='clip-post-monitor',
            daemon=True,
        )
        self._post_thread.start()
        logger.info('ClipCaptureEngine started (clips_dir=%s)', self._clips_dir)

    def stop(self) -> None:
        """Stop the engine and shutdown the encoder pool."""
        if self._closed:
            return
        self._closed = True
        self._stop_event.set()
        if self._post_thread is not None:
            self._post_thread.join(timeout=3.0)
        self._encoder_pool.shutdown(wait=False, cancel_futures=True)
        logger.info('ClipCaptureEngine stopped')

    def start_clip(
        self,
        zone_id: str,
        track_id: str,
        event_id: str,
        timestamp: str,
    ) -> Optional[str]:
        """Begin a clip recording for a confirmed drowning alert.

        If a clip is already recording for this zone, extends it instead
        of creating a duplicate.

        Returns:
            clip_id on success, None if skipped (rate limit, disk full, etc.)
        """
        # Rate limit check
        if not self._check_rate_limit(zone_id):
            logger.warning(
                '[%s] Clip skipped: hourly rate limit (%d) reached',
                zone_id, CLIP_MAX_PER_HOUR,
            )
            return None

        # Disk space check
        if not self._check_disk_space():
            logger.critical(
                '[%s] Clip skipped: disk space below %.1f GB threshold',
                zone_id, CLIP_MIN_FREE_DISK_GB,
            )
            self._publish_disk_warning(zone_id)
            return None

        with self._lock:
            # Extension: if already recording for this zone, extend the clip
            existing = self._active_clips.get(zone_id)
            if existing is not None and existing.is_recording_post:
                existing.post_deadline = time.monotonic() + CLIP_POST_BUFFER_SECONDS
                if event_id not in existing.event_ids:
                    existing.event_ids.append(event_id)
                if str(track_id) not in existing.track_ids:
                    existing.track_ids.append(str(track_id))
                logger.info(
                    '[%s] Clip extended: clip_id=%s, events=%d',
                    zone_id, existing.clip_id, len(existing.event_ids),
                )
                return existing.clip_id

            # Snapshot the pre-buffer
            clip_buffer = self._clip_buffers.get(zone_id)
            if clip_buffer is None:
                logger.warning('[%s] No clip buffer registered', zone_id)
                return None

            pre_frames = clip_buffer.snapshot()
            if not pre_frames:
                logger.warning('[%s] Clip buffer empty — no pre-event frames', zone_id)
                # Continue anyway — we'll still capture post-event frames

            clip_id = str(uuid.uuid4())
            state = _ZoneClipState(
                clip_id=clip_id,
                zone_id=zone_id,
                event_id=event_id,
                track_id=str(track_id),
                trigger_timestamp=timestamp,
                pre_frames=pre_frames,
            )
            self._active_clips[zone_id] = state

            # Record timestamp for rate limiting
            self._record_clip_timestamp(zone_id)

            logger.info(
                '[%s] Clip started: clip_id=%s, pre_frames=%d, event=%s',
                zone_id, clip_id, len(pre_frames), event_id,
            )
            return clip_id

    def feed_post_frame(self, zone_id: str, frame: np.ndarray) -> None:
        """Feed a post-event frame to an active clip recording.

        Called from the camera feeder loop for zones with active clips.
        JPEG-encodes the frame inline (same ~1–2 ms cost as the ring buffer).
        """
        with self._lock:
            state = self._active_clips.get(zone_id)
            if state is None or not state.is_recording_post:
                return

        # Encode outside the lock to minimize contention
        try:
            ok, buf = cv2.imencode(
                '.jpg', frame,
                [cv2.IMWRITE_JPEG_QUALITY, CLIP_JPEG_QUALITY],
            )
            if ok:
                jpeg_bytes = buf.tobytes()
                with self._lock:
                    state = self._active_clips.get(zone_id)
                    if state is not None and state.is_recording_post:
                        state.post_frames.append((jpeg_bytes, time.monotonic()))
        except cv2.error as exc:
            logger.debug('[%s] Post-frame JPEG encode failed: %s', zone_id, exc)

    def add_frame_annotation(
        self,
        zone_id: str,
        frame_index: int,
        timestamp_utc: str,
        detections: List[Dict[str, Any]],
    ) -> None:
        """Attach per-frame detection metadata to the active clip."""
        with self._lock:
            state = self._active_clips.get(zone_id)
            if state is None:
                return
            state.annotations.append({
                'frame_index': frame_index,
                'timestamp_utc': timestamp_utc,
                'detections': detections,
            })

    def is_recording(self, zone_id: str) -> bool:
        """Check if a clip is currently recording for a zone."""
        with self._lock:
            state = self._active_clips.get(zone_id)
            return state is not None and state.is_recording_post

    # ── Post-event monitor ───────────────────────────────────────────────────

    def _post_event_monitor(self) -> None:
        """Background thread that checks for expired post-event timers."""
        while not self._stop_event.is_set():
            try:
                now = time.monotonic()
                zones_to_finalize = []

                with self._lock:
                    for zone_id, state in list(self._active_clips.items()):
                        if state.is_recording_post and now >= state.post_deadline:
                            state.is_recording_post = False
                            zones_to_finalize.append((zone_id, state))

                for zone_id, state in zones_to_finalize:
                    self._submit_finalization(zone_id, state)

            except Exception as exc:
                logger.exception('Clip post-event monitor error: %s', exc)

            time.sleep(0.5)  # Check every 500ms

    def _submit_finalization(self, zone_id: str, state: _ZoneClipState) -> None:
        """Submit clip for background MP4 encoding."""
        with self._pending_lock:
            if self._pending_encodes >= _MAX_ENCODE_BACKLOG:
                logger.warning(
                    '[%s] Clip encode backlog full (%d), skipping clip %s',
                    zone_id, _MAX_ENCODE_BACKLOG, state.clip_id,
                )
                with self._lock:
                    self._active_clips.pop(zone_id, None)
                return
            self._pending_encodes += 1

        try:
            self._encoder_pool.submit(self._finalize_clip, zone_id, state)
        except RuntimeError:
            # Pool is shut down
            with self._pending_lock:
                self._pending_encodes -= 1
            with self._lock:
                self._active_clips.pop(zone_id, None)

    # ── Clip finalization (runs in encoder thread pool) ───────────────────────

    def _finalize_clip(self, zone_id: str, state: _ZoneClipState) -> None:
        """Decode JPEG frames, write MP4, emit sidecar JSON.

        Runs in a background thread from the encoder pool.
        """
        try:
            all_frames = state.pre_frames + state.post_frames
            if not all_frames:
                logger.warning('[%s] No frames to write for clip %s', zone_id, state.clip_id)
                return

            # Decode JPEG bytes back to BGR ndarrays
            bgr_frames = []
            for jpeg_bytes, _ts in all_frames:
                if isinstance(jpeg_bytes, bytes):
                    arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
                    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                    if frame is not None:
                        bgr_frames.append(frame)
                elif isinstance(jpeg_bytes, np.ndarray):
                    bgr_frames.append(jpeg_bytes)

            if not bgr_frames:
                logger.warning('[%s] All frames failed to decode for clip %s', zone_id, state.clip_id)
                return

            # Build file paths
            trigger_dt = datetime.fromisoformat(
                state.trigger_timestamp.replace('Z', '+00:00')
            )
            date_str = trigger_dt.strftime('%Y-%m-%d_%H-%M-%S')
            event_prefix = state.event_ids[0][:8] if state.event_ids else 'unknown'
            filename_base = f'{date_str}_evt-{event_prefix}'

            zone_dir = os.path.join(self._clips_dir, 'pending', zone_id)
            os.makedirs(zone_dir, exist_ok=True)

            mp4_path = os.path.join(zone_dir, f'{filename_base}.mp4')
            json_path = os.path.join(zone_dir, f'{filename_base}.json')
            tmp_mp4_path = f'{mp4_path}.tmp'

            # Write MP4 via OpenCV VideoWriter (CPU-only, no GPU dependency)
            h, w = bgr_frames[0].shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(tmp_mp4_path, fourcc, CLIP_VIDEO_FPS, (w, h))

            if not writer.isOpened():
                logger.error('[%s] VideoWriter failed to open for clip %s', zone_id, state.clip_id)
                self._safe_remove(tmp_mp4_path)
                return

            try:
                for frame in bgr_frames:
                    # Resize if frame dimensions don't match first frame
                    if frame.shape[:2] != (h, w):
                        frame = cv2.resize(frame, (w, h))
                    writer.write(frame)
            finally:
                writer.release()

            # Atomic rename
            try:
                os.replace(tmp_mp4_path, mp4_path)
            except OSError as exc:
                logger.error('[%s] Failed to finalize clip MP4: %s', zone_id, exc)
                self._safe_remove(tmp_mp4_path)
                return

            # Build and write sidecar JSON
            duration = len(bgr_frames) / CLIP_VIDEO_FPS
            pre_count = len(state.pre_frames)

            # Compute aggregate stats from annotations
            all_scores = []
            trigger_indices = []
            for ann in state.annotations:
                for det in ann.get('detections', []):
                    score = det.get('behavior_score')
                    if score is not None:
                        all_scores.append(score)
                    if det.get('is_trigger_frame'):
                        trigger_indices.append(ann['frame_index'])

            sidecar = {
                'schema_version': '1.0',
                'clip_id': state.clip_id,
                'event_ids': state.event_ids,
                'zone_id': zone_id,
                'clip_file': os.path.basename(mp4_path),
                'duration_seconds': round(duration, 1),
                'fps': CLIP_VIDEO_FPS,
                'resolution': [w, h],
                'codec': 'h264',
                'trigger_timestamp_utc': state.trigger_timestamp,
                'pre_buffer_frames': pre_count,
                'post_buffer_frames': len(state.post_frames),
                'total_frames': len(bgr_frames),
                'track_ids': state.track_ids,
                'per_frame_annotations': state.annotations,
                'aggregate': {
                    'max_confidence': round(max(all_scores), 4) if all_scores else None,
                    'mean_confidence': round(
                        sum(all_scores) / len(all_scores), 4,
                    ) if all_scores else None,
                    'trigger_frame_indices': trigger_indices,
                    'total_detections_in_clip': sum(
                        len(ann.get('detections', []))
                        for ann in state.annotations
                    ),
                },
                'review': {
                    'status': 'pending',
                    'reviewed_by': None,
                    'reviewed_at': None,
                    'outcome': None,
                    'notes': None,
                },
                'created_at': datetime.now(timezone.utc).isoformat(),
            }

            # Atomic JSON write
            tmp_json_path = f'{json_path}.tmp'
            try:
                with open(tmp_json_path, 'w', encoding='utf-8') as fh:
                    json.dump(sidecar, fh, ensure_ascii=False, indent=2)
                os.replace(tmp_json_path, json_path)
            except OSError as exc:
                logger.error('[%s] Failed to write clip sidecar: %s', zone_id, exc)
                self._safe_remove(tmp_json_path)
                # MP4 was already written successfully — leave it for manual recovery
                return

            logger.info(
                '[%s] Clip finalized: %s (%d frames, %.1fs, %s)',
                zone_id, state.clip_id, len(bgr_frames), duration,
                os.path.basename(mp4_path),
            )

            # Emit MQTT event (Rule R6-D: cross-container)
            if self._mqtt_client is not None:
                try:
                    payload = {
                        'message_type': 'clip_ready',
                        'component': 'clip_capture',
                        'zone_id': zone_id,
                        'clip_id': state.clip_id,
                        'event_ids': state.event_ids,
                        'duration_seconds': round(duration, 1),
                        'clip_file': os.path.basename(mp4_path),
                    }
                    self._mqtt_client._client.publish(
                        'aquaguard/system/clip_ready',
                        json.dumps(payload),
                        qos=0,
                    )
                except (RuntimeError, ValueError, OSError, TypeError) as exc:
                    logger.warning(
                        '[%s] clip_ready publish failed: %s', zone_id, exc,
                    )

        except Exception as exc:
            logger.exception(
                '[%s] Clip finalization failed for %s: %s',
                zone_id, state.clip_id, exc,
            )
        finally:
            with self._pending_lock:
                self._pending_encodes = max(0, self._pending_encodes - 1)
            with self._lock:
                # Only remove if this is still the active clip for the zone
                current = self._active_clips.get(zone_id)
                if current is not None and current.clip_id == state.clip_id:
                    self._active_clips.pop(zone_id, None)

    # ── Disk & rate limit checks ─────────────────────────────────────────────

    def _check_disk_space(self) -> bool:
        """Return True if sufficient disk space is available."""
        try:
            usage = shutil.disk_usage(self._clips_dir)
            free_gb = usage.free / (1024 ** 3)
            return free_gb >= CLIP_MIN_FREE_DISK_GB
        except OSError:
            return True  # If we can't check, allow the write

    def _check_rate_limit(self, zone_id: str) -> bool:
        """Return True if this zone hasn't exceeded CLIP_MAX_PER_HOUR."""
        now = time.time()
        cutoff = now - 3600  # 1 hour ago

        timestamps = self._clip_timestamps.get(zone_id, [])
        # Prune old entries
        timestamps = [ts for ts in timestamps if ts > cutoff]
        self._clip_timestamps[zone_id] = timestamps

        return len(timestamps) < CLIP_MAX_PER_HOUR

    def _record_clip_timestamp(self, zone_id: str) -> None:
        """Record a clip creation timestamp for rate limiting."""
        if zone_id not in self._clip_timestamps:
            self._clip_timestamps[zone_id] = []
        self._clip_timestamps[zone_id].append(time.time())

    def _publish_disk_warning(self, zone_id: str) -> None:
        """Publish MQTT disk space warning."""
        if self._mqtt_client is None:
            return
        try:
            payload = {
                'message_type': 'disk_warning',
                'component': 'clip_capture',
                'zone_id': zone_id,
                'threshold_gb': CLIP_MIN_FREE_DISK_GB,
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }
            self._mqtt_client._client.publish(
                'aquaguard/system/disk_warning',
                json.dumps(payload),
                qos=0,
            )
        except (TypeError, ValueError, OSError, RuntimeError) as exc:
            logger.error('Failed to publish disk warning: %s', exc)

    # ── Cleanup ──────────────────────────────────────────────────────────────

    def _cleanup_tmp_files(self) -> None:
        """Remove stale .tmp files from previous crashes."""
        cleaned = 0
        for root, _dirs, files in os.walk(self._clips_dir):
            for fname in files:
                if fname.endswith('.tmp'):
                    try:
                        os.remove(os.path.join(root, fname))
                        cleaned += 1
                    except OSError:
                        pass
        if cleaned:
            logger.info('Cleaned up %d stale .tmp clip files', cleaned)

    @staticmethod
    def _safe_remove(path: str) -> None:
        """Remove a file if it exists, ignoring errors."""
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass
