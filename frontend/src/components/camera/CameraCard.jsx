/**
 * AquaGuard — CameraCard component (Mission Control Theme)
 *
 * Features:
 * - High-contrast tactical card with cyan/rose glow states
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
  const cameraStatus = normalizeServiceStatus(camera.runtime_status ?? camera.status);
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
    streamSessionId,
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
      className={`group relative overflow-hidden cursor-pointer transition-all duration-300 ease-in-out focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 focus:shadow-[0_0_20px_rgba(34,211,238,0.3)] border rounded bg-[#0a0f18] ${
        hasActiveAlert ? 'ring-1 ring-rose-500 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] z-10' : 'border-slate-800 hover:border-cyan-500/50 hover:shadow-[0_8px_24px_rgba(6,182,212,0.15)] shadow-[0_4px_12px_rgba(0,0,0,0.5)]'
      }`}
      style={{ touchAction: 'manipulation' }}
      aria-label={`Camera card ${camera.zone_name || camera.zone_id}`}
      whileHover={!hasActiveAlert ? { scale: 1.02, y: -4 } : {}}
      whileTap={{ scale: 0.98 }}
    >
      {/* Stream area */}
      <div
        className={`relative w-full bg-[#05080f] aspect-video overflow-hidden ${
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
            key={`${camera.zone_id}-${streamSessionId}`}
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

        {/* Surveillance HUD: scan-line overlay + bottom gradient + REC dot */}
        {(showWebRTC || showFallbackStream) && (
          <>
            <div className="scan-line-overlay" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent pointer-events-none z-[5]" />
            <div className="absolute bottom-2.5 left-3 z-[6] flex items-center gap-1.5 pointer-events-none">
              <span className="h-2 w-2 rounded-full bg-rose-500 recording-dot" />
              <span className="text-[10px] font-bold text-white/80 tracking-wider [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">REC</span>
            </div>
          </>
        )}


        {/* Always-visible floating context pills + hover menu */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3 pointer-events-none" ref={telemetryMenuRef}>
          <span className="text-[10px] font-mono font-bold text-white uppercase tracking-widest truncate max-w-[55%] [text-shadow:0_2px_4px_rgba(0,0,0,0.8)] px-2 py-1 bg-black/40 backdrop-blur-md rounded border border-white/10">
            {camera.zone_name || camera.zone_id}
          </span>
          <div className="relative flex items-center gap-2 pointer-events-auto">
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/20 px-2 py-1 text-[10px] font-mono font-bold text-emerald-400 shadow-sm backdrop-blur-md uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse" />
              LIVE
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowTelemetryMenu((prev) => !prev);
              }}
              className={`inline-flex h-6 w-6 items-center justify-center rounded border border-white/20 bg-black/60 text-white hover:bg-black shadow-sm transition-opacity duration-200 backdrop-blur-md ${
                showTelemetryMenu ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
              }`}
              style={{ touchAction: 'manipulation', minHeight: '36px', minWidth: '36px' }}
              aria-label="Open camera telemetry"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
              </svg>
            </button>
            {showTelemetryMenu && (
              <div className="absolute right-0 top-10 w-56 rounded-lg border border-slate-700 bg-slate-900/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] p-3 text-[10px] font-mono text-slate-300 uppercase tracking-wide">
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Health</span>
                  <span className={healthDegraded ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>
                    {healthDegraded ? 'DEGRADED' : 'NOMINAL'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">FPS</span>
                  <span className="font-bold text-white">{fpsActual !== null ? fpsActual.toFixed(1) : '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Loss</span>
                  <span className="font-bold text-white">{corruptionRate !== null ? `${(corruptionRate * 100).toFixed(1)}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-500">Reconnects</span>
                  <span className="font-bold text-white">{reconnectCount}</span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Transport</span>
                  <span className="font-bold text-cyan-400">{transportLabel}</span>
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
                  className="text-lg text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  ⚠
                </motion.span>
                <div>
                  <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-rose-100">DROWNING DETECTED</p>
                  <p className="text-[10px] font-mono mt-0.5 text-rose-400/90 uppercase tracking-wider">{alertConfidenceLabel} · {alertLabelTime}</p>
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
