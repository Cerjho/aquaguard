/**
 * AquaGuard — CameraCard component.
 *
 * Displays a single camera zone tile:
 * - Zone name and location description
 * - MJPEG live stream via <img> tag (using API_BASE_URL from constants)
 * - Green/red status indicator based on camera.is_active
 */

import React, { useEffect, useState, memo } from 'react';
import { API_BASE_URL } from '../../utils/constants';

function CameraCard({ camera, onStreamAuthFailure, onFocus }) {
  const [imgError, setImgError] = useState(false);
  const streamToken = camera.stream_token || null;
  const streamUrl = streamToken
    ? `${API_BASE_URL}/api/v1/cameras/${camera.zone_id}/stream?token=${encodeURIComponent(streamToken)}`
    : null;
  const normalizeStatus = (value) => {
    if (typeof value === 'boolean') return value ? 'online' : 'offline';
    if (!value) return 'unknown';
    const lowered = String(value).toLowerCase();
    if (['online', 'active', 'running', 'healthy'].includes(lowered)) return 'online';
    if (['offline', 'inactive', 'stopped', 'down'].includes(lowered)) return 'offline';
    return lowered;
  };

  const detectionOnline = normalizeStatus(camera.detection_engine_status) === 'online';
  const cameraOnline =
    normalizeStatus(camera.runtime_status ?? camera.status ?? camera.is_active) === 'online';
  const isActive = detectionOnline && cameraOnline;
  const showStream = isActive && !imgError && Boolean(streamUrl);

  useEffect(() => {
    // Reset image fallback state whenever the stream token rotates.
    setImgError(false);
  }, [streamToken]);

  const offlineReason = !detectionOnline
    ? 'Detection engine offline'
    : !cameraOnline
    ? 'Camera offline'
    : !streamToken
    ? 'Authorizing stream…'
    : 'Stream unavailable';

  return (
    <article
      className="bg-white rounded-xl shadow overflow-hidden border border-slate-200 flex flex-col"
      aria-label={`Camera card ${camera.zone_name || camera.zone_id}`}
    >
      {/* Stream area */}
      <div className="relative w-full bg-slate-900 aspect-video overflow-hidden">
        {showStream ? (
          <img
            src={streamUrl}
            alt={`Live feed — ${camera.zone_name}`}
            className="w-full h-full object-cover"
            onError={() => {
              setImgError(true);
              if (typeof onStreamAuthFailure === 'function') {
                onStreamAuthFailure(camera.zone_id);
              }
            }}
          />
        ) : (
          /* Fallback when stream is unavailable */
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
            <svg
              className="w-10 h-10 opacity-40"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
             </svg>
            <span className="text-xs font-medium opacity-60">{offlineReason}</span>
          </div>
        )}

        {/* Status pill overlaid on the stream */}
        <div className="absolute top-2 right-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow ${
              isActive
                ? 'bg-green-500/90 text-white'
                : 'bg-red-500/90 text-white'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isActive ? 'bg-white animate-pulse' : 'bg-white'
              }`}
            />
            {isActive ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Camera info footer */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate text-sm">
              {camera.zone_name || camera.zone_id}
            </p>
            {camera.location_description && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {camera.location_description}
              </p>
            )}
          </div>

          {/* Status dot */}
          <span
            className={`mt-0.5 shrink-0 w-3 h-3 rounded-full ring-2 ring-white ${
              isActive ? 'bg-green-500' : 'bg-red-500'
            }`}
            title={isActive ? 'Camera active' : 'Camera inactive'}
          />
        </div>
        <button
          type="button"
          onClick={() => onFocus?.(camera)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFocus?.(camera);
            }
          }}
          className="mt-3 w-full rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-2 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label={`Focus camera ${camera.zone_name || camera.zone_id}`}
        >
          Focus view
        </button>
      </div>
    </article>
  );
}

export default memo(CameraCard);
