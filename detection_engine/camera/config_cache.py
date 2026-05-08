"""
Cached camera config — enables offline startup when backend is unreachable.

On successful backend camera fetch, the camera list is persisted to a local
JSON file.  On next startup, if the backend is down, the cached config is
loaded as a fallback so the detection engine can still start and run.

Eliminates V5: detection engine no longer crashes on backend unavailability.
"""
import json
import logging
import os
import time
from typing import List, Optional

logger = logging.getLogger(__name__)

_CACHE_FILENAME = "cameras_cache.json"
_CACHE_MAX_AGE_SECONDS = 7 * 24 * 3600  # 7 days


class CameraConfigCache:
    """
    File-backed camera config cache.

    Thread-safe for reads; writes happen only from the main startup thread.

    Usage:
        cache = CameraConfigCache(data_dir="/path/to/data")
        cameras = cache.load()   # Returns cached cameras or None
        cache.save(cameras_list) # Persist after successful fetch
    """

    def __init__(self, data_dir: str):
        self._cache_path = os.path.join(data_dir, _CACHE_FILENAME)
        os.makedirs(data_dir, exist_ok=True)

    def save(self, cameras: List[dict]) -> bool:
        """
        Persist camera config list to local cache.

        Returns True on success, False on failure.
        """
        try:
            cache_data = {
                "cameras": cameras,
                "cached_at": time.time(),
                "cached_at_iso": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime(),
                ),
            }
            tmp_path = f"{self._cache_path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as fh:
                json.dump(cache_data, fh, indent=2)
            os.replace(tmp_path, self._cache_path)
            logger.info(
                "Camera config cached: %d cameras → %s",
                len(cameras), self._cache_path,
            )
            return True
        except OSError as exc:
            logger.error("Failed to cache camera config: %s", exc)
            return False

    def load(self) -> Optional[List[dict]]:
        """
        Load cached camera config from disk.

        Returns:
            List of camera dicts if cache exists and is not expired.
            None if no cache, expired, or corrupted.
        """
        if not os.path.exists(self._cache_path):
            logger.debug("No camera config cache found at %s", self._cache_path)
            return None

        try:
            with open(self._cache_path, "r", encoding="utf-8") as fh:
                cache_data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning(
                "Camera config cache corrupted, ignoring: %s", exc,
            )
            return None

        # Check cache age
        cached_at = cache_data.get("cached_at", 0)
        age_seconds = time.time() - cached_at
        if age_seconds > _CACHE_MAX_AGE_SECONDS:
            logger.warning(
                "Camera config cache expired (%.1f hours old, max=%d hours)",
                age_seconds / 3600,
                _CACHE_MAX_AGE_SECONDS // 3600,
            )
            return None

        cameras = cache_data.get("cameras")
        if not isinstance(cameras, list) or not cameras:
            logger.warning("Camera config cache is empty or malformed")
            return None

        logger.info(
            "Loaded %d cameras from cache (%.1f hours old)",
            len(cameras),
            age_seconds / 3600,
        )
        return cameras

    @property
    def cache_path(self) -> str:
        """Return the path to the cache file."""
        return self._cache_path
