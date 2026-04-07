/**
 * AquaGuard — CameraCard component.
 *
 * Displays a single camera zone tile:
 * - Zone name and location description
 * - MJPEG live stream via <img> tag (using API_BASE_URL from constants)
 * - Green/red status indicator based on camera.is_active
 */

import React, { useEffect, useState, memo, useRef, useMemo } from 'react';
import useWebRTCStream from '../../hooks/useWebRTCStream';
import { normalizeServiceStatus } from '../../utils/statusHelpers';
import { useAlertState } from '../../context/AlertContext';
import { formatDateTime } from '../../utils/dateFormat';

function normalizeBbox(bbox) {
  if (!bbox) return null;

  if (Array.isArray(bbox) && bbox.length === 4) {
    const [x1, y1, x2, y2] = bbox.map(Number);
    if ([x1, y1, x2, y2].some((value) => Number.isNaN(value))) return null;
    const width = x2 - x1;
    const height = y2 - y1;
    if (x1 < 0 || y1 < 0 || width <= 0 || height <= 0) return null;
    if (x2 <= 1 && y2 <= 1) {
      return {
        cx: x1 + (width / 2),
        cy: y1 + (height / 2),
      };
    }
    return null;
  }

  if (typeof bbox === 'object') {
    const x = Number(bbox.x ?? bbox.left ?? bbox.x1);
    const y = Number(bbox.y ?? bbox.top ?? bbox.y1);
    const w = Number(bbox.w ?? bbox.width);
    const h = Number(bbox.h ?? bbox.height);
    if ([x, y, w, h].every((value) => !Number.isNaN(value))) {
      if (x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1) {
        return {
          cx: x + (w / 2),
          cy: y + (h / 2),
        };
      }
      return null;
    }
  }

  return null;
}

function buildZoomStyle(bbox) {
  const normalized = normalizeBbox(bbox);
  if (!normalized) return undefined;
  const tx = (0.5 - normalized.cx) * 100;
  const ty = (0.5 - normalized.cy) * 100;

  return {
    transform: `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(1.8)`,
    transformOrigin: 'center center',
  };
}

function CameraCard({
  camera,
  onStreamAuthFailure,
  onFocus,
  shouldRenderStream = true,
  pausedReason = 'Stream paused',
}) {
  const [imgError, setImgError] = useState(false);
  const imgRef = useRef(null);
  const streamToken = camera.stream_token || null;
  const streamSessionId = camera.stream_session_id || 0;
  const { activeAlerts, acknowledge } = useAlertState();
  const videoRef = useRef(null);
  const detectionOnline = normalizeServiceStatus(camera.detection_engine_status) === 'online';
  const cameraOnline =
    normalizeServiceStatus(camera.runtime_status ?? camera.status ?? camera.is_active) === 'online';
  const isActive = detectionOnline && cameraOnline;
  const health = camera.health || null;
  const healthStatus = normalizeServiceStatus(health?.status);
  const fpsActual = typeof health?.fps_actual === 'number' ? health.fps_actual : null;
  const fpsTarget = typeof health?.fps_target === 'number' ? health.fps_target : null;
  const corruptionRate = typeof health?.corruption_rate === 'number' ? health.corruption_rate : null;
  const reconnectCount = Number.isFinite(health?.reconnect_count) ? health.reconnect_count : 0;
  const fpsDegraded =
    typeof fpsActual === 'number'
    && typeof fpsTarget === 'number'
    && fpsTarget > 0
    && (fpsActual / fpsTarget) < 0.5;
  const corruptionDegraded =
    typeof corruptionRate === 'number' && corruptionRate > 0.1;
  const healthDegraded =
    healthStatus === 'degraded' || fpsDegraded || corruptionDegraded;
  const { transport, webrtcState, streamUrl, videoStream } = useWebRTCStream({
    zoneId: camera.zone_id,
    streamToken,
    shouldRenderStream,
    isActive,
  });
  const showWebRTC = shouldRenderStream && isActive && transport === 'webrtc' && Boolean(videoStream);
  // Show MJPEG fallback stream immediately while WebRTC negotiates (faster reconnection)
  const showFallbackStream = shouldRenderStream && isActive && !imgError && Boolean(streamUrl) && !showWebRTC;
  const zoneAlerts = useMemo(
    () => (activeAlerts || []).filter((alertItem) => alertItem?.zone_id === camera.zone_id),
    [activeAlerts, camera.zone_id]
  );
  const activeZoneAlert = zoneAlerts[0] || null;
  const hasActiveAlert = Boolean(activeZoneAlert);
  const alertConfidence = activeZoneAlert?.confidence ?? activeZoneAlert?.final_confidence ?? null;
  const alertConfidenceLabel = alertConfidence != null
    ? `${(Number(alertConfidence) * 100).toFixed(0)}% confidence`
    : '— confidence';
  const alertTime = activeZoneAlert?.alerted_at || activeZoneAlert?.triggered_at || activeZoneAlert?.timestamp;
  const alertLabelTime = alertTime ? formatDateTime(alertTime) : 'just now';
  const zoomStyle = hasActiveAlert ? buildZoomStyle(activeZoneAlert?.bbox) : undefined;

  useEffect(() => {
    // Reset image fallback state whenever the stream token rotates.
    setImgError(false);
  }, [streamToken]);

  useEffect(() => {
    // Resume from transient browser/network hiccups when stream rendering is re-enabled.
    if (shouldRenderStream) {
      setImgError(false);
    }
  }, [shouldRenderStream, streamSessionId]);

  useEffect(() => {
    if (shouldRenderStream) return;
    // Explicitly clear src when stream is paused so browsers close stale MJPEG connections.
    if (imgRef.current) {
      imgRef.current.src = '';
    }
  }, [shouldRenderStream]);

  useEffect(() => () => {
    // Ensure connection is closed when navigating away from dashboard route.
    if (imgRef.current) {
      imgRef.current.src = '';
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!videoStream) {
      videoRef.current.srcObject = null;
      return;
    }
    videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  // Only show offline reason if neither WebRTC nor MJPEG fallback is available
  const offlineReason = !detectionOnline
    ? 'Detection engine offline'
    : !cameraOnline
    ? 'Camera offline'
    : !shouldRenderStream
    ? pausedReason
    : !streamToken
    ? 'Authorizing stream…'
    : 'Connecting…';

  return (
    <article
      id={`camera-card-${camera.zone_id}`}
      role="button"
      tabIndex={0}
      onClick={(e) => onFocus?.(camera, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onFocus?.(camera, e.currentTarget);
        }
      }}
      className="bg-white rounded-xl shadow overflow-hidden border border-slate-200 flex flex-col cursor-pointer transition-all hover:shadow-md hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
      aria-label={`Camera card ${camera.zone_name || camera.zone_id}`}
    >
      {/* Stream area */}
      <div
        className={`relative w-full bg-slate-900 aspect-video overflow-hidden ${
          hasActiveAlert ? 'ring-4 ring-red-500 animate-pulse' : ''
        }`}
      >
        {showWebRTC ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover transition-transform duration-300"
            style={zoomStyle}
            aria-label={`Live feed — ${camera.zone_name}`}
          />
        ) : showFallbackStream ? (
          <img
            ref={imgRef}
            key={`${camera.zone_id}-${streamToken}-${streamSessionId}`}
            src={streamUrl}
            alt={`Live feed — ${camera.zone_name}`}
            className="w-full h-full object-cover transition-transform duration-300"
            style={zoomStyle}
            onLoad={() => {
              setImgError(false);
            }}
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

        {/* Status pills overlaid on the stream */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
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
          {isActive && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900/80 text-white">
              {transport === 'webrtc' ? 'WebRTC' : 'MJPEG fallback'}
            </span>
          )}
        </div>

        {hasActiveAlert && (
          <>
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-red-900/85 to-red-800/10 px-3 py-2 text-white">
              <p className="text-[11px] font-bold tracking-wide uppercase">⚠ Drowning detected</p>
              <p className="text-[11px] mt-0.5 opacity-95">{alertConfidenceLabel} · {alertLabelTime}</p>
            </div>
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-slate-950/85 via-slate-900/40 to-transparent">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  acknowledge(activeZoneAlert?.alert_id || activeZoneAlert?.id || activeZoneAlert);
                }}
                className="w-full rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider py-2"
              >
                Acknowledge Alert
              </button>
            </div>
          </>
        )}
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
        {health && (
          <div className="mt-2 space-y-1 text-[11px] text-slate-500">
            <div className="flex items-center justify-between">
              <span>Camera health</span>
              <span
                className={
                  healthDegraded
                    ? 'font-semibold text-yellow-700'
                    : 'font-semibold text-slate-700'
                }
              >
                {healthDegraded ? 'Degraded' : 'Normal'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>FPS</span>
              <span>
                {fpsActual !== null ? fpsActual.toFixed(1) : '—'}
                {fpsTarget !== null ? ` / ${fpsTarget.toFixed(0)}` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Corruption</span>
              <span>{corruptionRate !== null ? `${(corruptionRate * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reconnects</span>
              <span>{reconnectCount}</span>
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Click to open focus view</p>
      </div>
    </article>
  );
}

export default memo(CameraCard);
