/**
 * AquaGuard — CameraCard component (Ocean Theme)
 *
 * Features:
 * - Glassmorphism card with ocean-themed styling
 * - Glowing border on active alerts
 * - Animated status indicators
 * - WebRTC/MJPEG live stream support
 */

import React, { useEffect, useState, memo, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import useWebRTCStream from '../../hooks/useWebRTCStream';
import { normalizeServiceStatus } from '../../utils/statusHelpers';
import { useAlertState } from '../../context/AlertContext.jsx';
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
  const [showTelemetryMenu, setShowTelemetryMenu] = useState(false);
  const telemetryMenuRef = useRef(null);
  const [imgError, setImgError] = useState(false);
  const imgRef = useRef(null);
  const streamToken = camera.stream_token || null;
  const streamSessionId = camera.stream_session_id || 0;
  const { activeAlerts } = useAlertState();
  const videoRef = useRef(null);
  const detectionStatus = normalizeServiceStatus(camera.detection_engine_status);
  const cameraStatus = normalizeServiceStatus(camera.runtime_status ?? camera.status ?? camera.is_active);
  // Only hard-stop streaming on explicit offline states; "unknown" should still attempt connection.
  const detectionOnline = detectionStatus !== 'offline';
  const cameraOnline = cameraStatus !== 'offline';
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
  const { transport, streamUrl, videoStream } = useWebRTCStream({
    zoneId: camera.zone_id,
    streamToken,
    shouldRenderStream,
    isActive,
  });
  const transportLabel = transport === 'webrtc' ? 'WebRTC' : 'MJPEG';
  const transportDetail = transport === 'webrtc'
    ? 'low latency'
    : 'fallback';
  const showWebRTC = shouldRenderStream && isActive && transport === 'webrtc' && Boolean(videoStream);
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
    setImgError(false);
  }, [streamToken]);

  useEffect(() => {
    if (shouldRenderStream) {
      setImgError(false);
    }
  }, [shouldRenderStream, streamSessionId]);

  useEffect(() => {
    if (shouldRenderStream) return;
    if (imgRef.current) {
      imgRef.current.src = '';
    }
  }, [shouldRenderStream]);

  useEffect(() => () => {
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

  useEffect(() => {
    const closeOnOutside = (event) => {
      if (!telemetryMenuRef.current) return;
      if (telemetryMenuRef.current.contains(event.target)) return;
      setShowTelemetryMenu(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  const offlineReason = detectionStatus === 'offline'
    ? 'Detection engine offline'
    : cameraStatus === 'offline'
    ? 'Camera offline'
    : !shouldRenderStream
    ? pausedReason
    : !streamToken
    ? 'Authorizing stream…'
    : 'Connecting…';

  return (
    <motion.article
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
      className={`group relative overflow-hidden cursor-pointer transition-all duration-500 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-300/70 border rounded-2xl shadow-md bg-white ${
        hasActiveAlert ? 'ring-2 ring-rose-400 border-rose-200 shadow-rose-200/60 shadow-lg' : 'border-slate-200 hover:shadow-lg hover:shadow-slate-200/70'
      }`}
      style={{ touchAction: 'manipulation' }}
      aria-label={`Camera card ${camera.zone_name || camera.zone_id}`}
      whileHover={!hasActiveAlert ? { scale: 1.02, y: -4 } : {}}
      whileTap={{ scale: 0.98 }}
    >
      {/* Stream area */}
      <div
        className={`relative w-full bg-slate-200 aspect-video overflow-hidden ${
          hasActiveAlert ? 'animate-pulse-glow' : ''
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
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-16 h-16 rounded-lg bg-slate-800/50 flex items-center justify-center">
              <svg
                className="w-8 h-8 opacity-50"
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
            </div>
            <span className="text-xs font-medium opacity-60">{offlineReason}</span>
          </div>
        )}


        {/* Always-visible floating context pills + hover menu */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3" ref={telemetryMenuRef}>
          <span className="text-[11px] font-bold text-slate-900 truncate max-w-[55%]">
            {camera.zone_name || camera.zone_id}
          </span>
          <div className="relative flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/80 px-2 py-1 text-[11px] font-medium text-emerald-700 shadow-sm backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowTelemetryMenu((prev) => !prev);
              }}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-600 hover:bg-white shadow-sm transition-opacity duration-200 ${
                showTelemetryMenu ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '44px', minWidth: '44px' }}
              aria-label="Open camera telemetry"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
              </svg>
            </button>
            {showTelemetryMenu && (
              <div className="absolute right-0 top-10 w-56 rounded-2xl border border-white/70 bg-white/70 backdrop-blur-xl shadow-lg p-3 text-xs text-slate-700">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Health Status</span>
                  <span className={healthDegraded ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                    {healthDegraded ? 'Degraded' : 'Normal'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Current FPS</span>
                  <span className="font-mono">{fpsActual !== null ? fpsActual.toFixed(1) : '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Packet Corruption</span>
                  <span className="font-mono">{corruptionRate !== null ? `${(corruptionRate * 100).toFixed(1)}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Reconnect Count</span>
                  <span className="font-mono">{reconnectCount}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Transport</span>
                  <span className="font-semibold">{transportLabel} ({transportDetail})</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {hasActiveAlert && (
          <>
            <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-rose-950/95 to-rose-900/10 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <motion.span 
                  className="text-lg"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  ⚠
                </motion.span>
                <div>
                  <p className="text-sm font-bold tracking-wide uppercase">Drowning Detected</p>
                  <p className="text-xs mt-0.5 opacity-90">{alertConfidenceLabel} · {alertLabelTime}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.article>
  );
}

export default memo(CameraCard);
