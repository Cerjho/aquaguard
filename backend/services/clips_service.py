"""Service helpers for clips routes — local drowning event clip management.

Manages clip sidecar JSON files on disk. Clips are organized in three
review-status folders:
  - clips/pending/    — unreviewed clips (default)
  - clips/confirmed/  — operator-confirmed incidents (retraining positive)
  - clips/dismissed/  — false positives (retraining hard negatives)

No database dependency — sidecar JSON files are the source of truth.
"""
import json
import logging
import os
import shutil
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from config.settings import (
    CLIP_PENDING_RETENTION_DAYS,
    CLIP_CONFIRMED_RETENTION_DAYS,
    CLIP_DISMISSED_RETENTION_DAYS,
)

logger = logging.getLogger(__name__)

# Resolve clips directory (absolute, per Rule R6-G)
_CLIPS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'clips',
)

_VALID_STATUSES = ('pending', 'confirmed', 'dismissed')
_VALID_OUTCOMES = ('confirmed', 'dismissed')


def _ensure_dirs() -> None:
    """Create clip folder structure if it doesn't exist."""
    for folder in _VALID_STATUSES:
        os.makedirs(os.path.join(_CLIPS_DIR, folder), exist_ok=True)


def list_clips(
    zone_id: Optional[str] = None,
    status: Optional[str] = None,
    from_dt: Optional[str] = None,
    to_dt: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    """List clip metadata with optional filters.

    Scans sidecar JSON files on disk.  Returns paginated results
    sorted newest-first.

    Returns:
        Dict with 'clips', 'total', 'page', 'limit' keys.
    """
    _ensure_dirs()
    folders = [status] if status and status in _VALID_STATUSES else list(_VALID_STATUSES)

    all_clips: List[Dict[str, Any]] = []
    for folder in folders:
        folder_path = os.path.join(_CLIPS_DIR, folder)
        if not os.path.isdir(folder_path):
            continue
        for root, _dirs, files in os.walk(folder_path):
            for fname in files:
                if not fname.endswith('.json'):
                    continue
                json_path = os.path.join(root, fname)
                try:
                    with open(json_path, 'r', encoding='utf-8') as fh:
                        meta = json.load(fh)
                except (OSError, json.JSONDecodeError):
                    continue

                # Apply zone filter
                if zone_id and meta.get('zone_id') != zone_id:
                    continue

                # Apply date filters
                created = meta.get('created_at', '')
                if from_dt and created < from_dt:
                    continue
                if to_dt and created > to_dt:
                    continue

                # Inject current storage folder as review status
                meta['_storage_folder'] = folder
                all_clips.append(meta)

    # Sort newest first
    all_clips.sort(key=lambda c: c.get('created_at', ''), reverse=True)

    total = len(all_clips)
    start = (page - 1) * limit
    end = start + limit

    return {
        'clips': all_clips[start:end],
        'total': total,
        'page': page,
        'limit': limit,
    }


def get_clip_metadata(clip_id: str) -> Optional[Dict[str, Any]]:
    """Find and return a single clip's sidecar metadata by clip_id.

    Searches all three folders.

    Returns:
        Sidecar dict with added '_json_path' and '_folder' keys,
        or None if not found.
    """
    _ensure_dirs()
    for folder in _VALID_STATUSES:
        result = _find_clip_in_folder(clip_id, folder)
        if result is not None:
            return result
    return None


def get_clip_video_path(clip_id: str) -> Optional[str]:
    """Return the absolute path to a clip's MP4 file.

    Returns None if the clip or its video file doesn't exist.
    """
    meta = get_clip_metadata(clip_id)
    if meta is None:
        return None

    json_path = meta.get('_json_path', '')
    clip_file = meta.get('clip_file', '')
    if not json_path or not clip_file:
        return None

    mp4_path = os.path.join(os.path.dirname(json_path), clip_file)
    if os.path.isfile(mp4_path):
        return mp4_path
    return None


def update_clip_review(
    clip_id: str,
    outcome: str,
    reviewed_by: str,
    notes: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update a clip's review status and move it to the appropriate folder.

    Args:
        clip_id: UUID of the clip.
        outcome: 'confirmed' or 'dismissed'.
        reviewed_by: Username of the reviewer.
        notes: Optional review notes.

    Returns:
        Updated sidecar dict, or None if clip not found or invalid outcome.
    """
    if outcome not in _VALID_OUTCOMES:
        return None

    meta = get_clip_metadata(clip_id)
    if meta is None:
        return None

    json_path = meta.pop('_json_path')
    current_folder = meta.pop('_folder')

    # Update review fields in sidecar
    meta['review'] = {
        'status': outcome,
        'reviewed_by': reviewed_by,
        'reviewed_at': datetime.now(timezone.utc).isoformat(),
        'outcome': outcome,
        'notes': notes,
    }

    # If already in the correct folder, just update the JSON
    if current_folder == outcome:
        try:
            with open(json_path, 'w', encoding='utf-8') as fh:
                json.dump(meta, fh, ensure_ascii=False, indent=2)
        except OSError as exc:
            logger.error('Failed to update clip sidecar %s: %s', json_path, exc)
            return None
        return meta

    # Move clip files to the new folder
    src_dir = os.path.dirname(json_path)
    zone_id = meta.get('zone_id', 'unknown')
    dest_dir = os.path.join(_CLIPS_DIR, outcome, zone_id)
    os.makedirs(dest_dir, exist_ok=True)

    clip_file = meta.get('clip_file', '')

    # Move MP4
    src_mp4 = os.path.join(src_dir, clip_file)
    dest_mp4 = os.path.join(dest_dir, clip_file)
    if os.path.isfile(src_mp4):
        try:
            shutil.move(src_mp4, dest_mp4)
        except OSError as exc:
            logger.error('Failed to move clip MP4 %s → %s: %s', src_mp4, dest_mp4, exc)
            return None

    # Write updated JSON to destination
    json_filename = os.path.basename(json_path)
    dest_json = os.path.join(dest_dir, json_filename)
    try:
        with open(dest_json, 'w', encoding='utf-8') as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
    except OSError as exc:
        logger.error('Failed to write clip sidecar %s: %s', dest_json, exc)
        return None

    # Remove old JSON
    try:
        if os.path.isfile(json_path):
            os.remove(json_path)
    except OSError:
        pass

    logger.info(
        'Clip %s reviewed as %s by %s (moved %s → %s)',
        clip_id, outcome, reviewed_by, current_folder, outcome,
    )
    return meta


def cleanup_expired_clips() -> Dict[str, int]:
    """Delete clips that have exceeded their retention period.

    Returns:
        Dict of {folder: count_deleted}.
    """
    _ensure_dirs()
    retention_map = {
        'pending': CLIP_PENDING_RETENTION_DAYS,
        'confirmed': CLIP_CONFIRMED_RETENTION_DAYS,
        'dismissed': CLIP_DISMISSED_RETENTION_DAYS,
    }

    now = time.time()
    deleted = {}

    for folder, retention_days in retention_map.items():
        if retention_days <= 0:
            continue
        retention_seconds = retention_days * 24 * 3600
        folder_path = os.path.join(_CLIPS_DIR, folder)
        count = 0

        if not os.path.isdir(folder_path):
            continue

        for root, _dirs, files in os.walk(folder_path):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    if now - os.path.getmtime(fpath) > retention_seconds:
                        os.remove(fpath)
                        count += 1
                except OSError:
                    pass

        if count > 0:
            deleted[folder] = count
            logger.info(
                'Clip cleanup: deleted %d expired files from clips/%s/ (retention=%dd)',
                count, folder, retention_days,
            )

    return deleted


# ── Internal helpers ─────────────────────────────────────────────────────────

def _find_clip_in_folder(clip_id: str, folder: str) -> Optional[Dict[str, Any]]:
    """Search a folder for a clip with matching clip_id."""
    folder_path = os.path.join(_CLIPS_DIR, folder)
    if not os.path.isdir(folder_path):
        return None

    for root, _dirs, files in os.walk(folder_path):
        for fname in files:
            if not fname.endswith('.json'):
                continue
            json_path = os.path.join(root, fname)
            try:
                with open(json_path, 'r', encoding='utf-8') as fh:
                    meta = json.load(fh)
            except (OSError, json.JSONDecodeError):
                continue

            if meta.get('clip_id') == clip_id:
                meta['_json_path'] = json_path
                meta['_folder'] = folder
                return meta

    return None
