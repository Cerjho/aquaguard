/**
 * AquaGuard — CameraGrid component.
 *
 * Uses shared DataCacheContext for instant page loads.
 * Renders a responsive grid of CameraCard tiles.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import api from '../../hooks/useApi';
import CameraCard from './CameraCard.jsx';
import { useSystemState } from '../../context/AlertContext.jsx';
import { useDataCache } from '../../context/DataCacheContext.jsx';
import { formatDateTime } from '../../utils/dateFormat';
import { API_BASE_URL } from '../../utils/constants';
import { normalizeServiceStatus } from '../../utils/statusHelpers';

const STREAM_TOKEN_REFRESH_BUFFER_SECONDS = 5;
const STREAM_REFRESH_CHECK_MS = 5000;
const HIDDEN_TOKEN_REFRESH_CHECK_MS = 20000;
const MAX_GRID_STREAMS = 1;

function CameraGrid({ reloadToken = 0 }) {
  const prefersReducedMotion = useReducedMotion();
  // Use shared cache for instant page loads
  const { cameras, camerasLoading: loading, camerasError: error, fetchCameras, refreshCameras } = useDataCache();
  const [detectionEngineStatus, setDetectionEngineStatus] = useState('unknown');
  const [cameraRuntimeMap, setCameraRuntimeMap] = useState({});
  const [streamTokens, setStreamTokens] = useState({});
  const [focusedCamera, setFocusedCamera] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMultiViewOpen, setIsMultiViewOpen] = useState(false);
  const [zoneEvents, setZoneEvents] = useState([]);
  const [zoneAlerts, setZoneAlerts] = useState([]);
  const [streamSessionId, setStreamSessionId] = useState(() => Date.now());
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document === 'undefined' ? true : !document.hidden
  );
  const {
    cameraStatuses,
    cameraHealthMap = {},
    systemStatus,
  } = useSystemState();
  const closeButtonRef = useRef(null);
  const lastFocusedTriggerRef = useRef(null);
  const wasDocumentHiddenRef = useRef(typeof document !== 'undefined' ? document.hidden : false);
  const tokenRefreshInFlightRef = useRef(new Set());
  const detectionOfflineTimerRef = useRef(null);

  const bumpStreamSession = useCallback(() => {
    setStreamSessionId(Date.now());
  }, []);

  useEffect(() => {
    bumpStreamSession();
  }, [reloadToken, bumpStreamSession]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const currentlyHidden = document.hidden;
      setIsDocumentVisible(!currentlyHidden);
      if (!currentlyHidden && wasDocumentHiddenRef.current) {
        bumpStreamSession();
      }
      wasDocumentHiddenRef.current = currentlyHidden;
    };

    const handleWindowFocus = () => {
      setIsDocumentVisible(!document.hidden);
      bumpStreamSession();
    };

    const handlePageShow = () => {
      setIsDocumentVisible(!document.hidden);
      bumpStreamSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [bumpStreamSession]);

  const mintStreamToken = useCallback(async (zoneId) => {
    if (!zoneId) return null;
    try {
      const res = await api.get(`/api/v1/cameras/${zoneId}/stream-token`);
      const payload = res?.data?.data ?? res?.data;
      const token = (
        payload?.stream_token
        || payload?.token
        || payload?.access_token
        || null
      );
      if (!token) return null;

      const ttlSeconds = Number(
        payload?.ttl_seconds
        ?? payload?.expires_in_seconds
        ?? 30
      );
      const expiresAt = payload?.expires_at
        ? new Date(payload.expires_at).getTime()
        : Date.now() + (ttlSeconds * 1000);

      return {
        token,
        expiresAt,
      };
    } catch {
      return null;
    }
  }, []);

  const mintStreamTokensForCameras = useCallback(async (cameraList) => {
    if (!Array.isArray(cameraList) || cameraList.length === 0) {
      setStreamTokens({});
      return;
    }

    const pairs = await Promise.all(
      cameraList.map(async (camera) => {
        const zoneId = camera?.zone_id;
        if (!zoneId) return null;
        const token = await mintStreamToken(zoneId);
        return [zoneId, token];
      })
    );

    const next = {};
    pairs.forEach((pair) => {
      if (!pair) return;
      const [zoneId, tokenMeta] = pair;
      if (zoneId && tokenMeta?.token) next[zoneId] = tokenMeta;
    });
    setStreamTokens(next);
  }, [mintStreamToken]);

  const refreshSingleToken = useCallback(async (zoneId) => {
    if (!zoneId) return;
    if (tokenRefreshInFlightRef.current.has(zoneId)) return;

    tokenRefreshInFlightRef.current.add(zoneId);
    try {
      const tokenMeta = await mintStreamToken(zoneId);
      if (!tokenMeta?.token) return;
      setStreamTokens((prev) => ({
        ...prev,
        [zoneId]: tokenMeta,
      }));
    } finally {
      tokenRefreshInFlightRef.current.delete(zoneId);
    }
  }, [mintStreamToken]);

  // Refresh cameras when reloadToken changes (e.g., after camera management)
  useEffect(() => {
    if (reloadToken > 0) {
      refreshCameras();
    }
  }, [reloadToken, refreshCameras]);

  const activeStreamZoneIds = useMemo(() => {
    if (!Array.isArray(cameras) || cameras.length === 0) return new Set();
    if (focusedCamera?.zone_id) return new Set([focusedCamera.zone_id]);
    if (!isDocumentVisible) return new Set();
    const prioritized = cameras
      .filter((camera) => {
        const runtime = normalizeServiceStatus(
          cameraRuntimeMap[camera.zone_id] ?? camera.is_active
        );
        return runtime === 'online';
      })
      .slice(0, MAX_GRID_STREAMS)
      .map((camera) => camera.zone_id);
    return new Set(prioritized);
  }, [cameras, focusedCamera, isDocumentVisible, cameraRuntimeMap]);

  const gridColsClass = useMemo(() => {
    const total = cameras.length;
    if (total <= 1) return 'grid-cols-1';
    if (total === 2) return 'grid-cols-2';
    if (total <= 4) return 'grid-cols-2';
    if (total <= 6) return 'grid-cols-3';
    return 'grid-cols-3';
  }, [cameras.length]);

  const streamCandidateCameras = useMemo(
    () => cameras.filter((camera) => activeStreamZoneIds.has(camera.zone_id)),
    [cameras, activeStreamZoneIds]
  );

  useEffect(() => {
    mintStreamTokensForCameras(streamCandidateCameras);
  }, [streamCandidateCameras, mintStreamTokensForCameras]);

  useEffect(() => {
    if (!Array.isArray(cameras) || cameras.length === 0) return undefined;
    const intervalId = setInterval(() => {
      const now = Date.now();
      const shouldThrottle = !isDocumentVisible && !focusedCamera;
      cameras.forEach((camera) => {
        const zoneId = camera?.zone_id;
        if (!zoneId) return;
        const meta = streamTokens[zoneId];
        if (!meta?.expiresAt) return;
        const expiresInMs = meta.expiresAt - now;
        if (expiresInMs <= STREAM_TOKEN_REFRESH_BUFFER_SECONDS * 1000) {
          if (shouldThrottle && !activeStreamZoneIds.has(zoneId)) return;
          refreshSingleToken(zoneId);
        }
      });
    }, isDocumentVisible ? STREAM_REFRESH_CHECK_MS : HIDDEN_TOKEN_REFRESH_CHECK_MS);
    return () => clearInterval(intervalId);
  }, [cameras, streamTokens, refreshSingleToken, isDocumentVisible, focusedCamera, activeStreamZoneIds]);

  useEffect(() => {
    const nextStatus = systemStatus?.detection_engine?.status
      ? normalizeServiceStatus(systemStatus.detection_engine.status)
      : null;
    if (!nextStatus) return;

    if (nextStatus === 'online') {
      // Go online immediately — clear any pending offline timer
      if (detectionOfflineTimerRef.current) {
        clearTimeout(detectionOfflineTimerRef.current);
        detectionOfflineTimerRef.current = null;
      }
      setDetectionEngineStatus('online');
    } else {
      // Debounce offline: only apply after 10s of sustained offline signal
      if (detectionOfflineTimerRef.current) return; // already waiting
      detectionOfflineTimerRef.current = setTimeout(() => {
        detectionOfflineTimerRef.current = null;
        setDetectionEngineStatus(nextStatus);
      }, 10000);
    }
  }, [systemStatus]);

  // Cleanup debounce timer on unmount
  useEffect(() => () => {
    if (detectionOfflineTimerRef.current) clearTimeout(detectionOfflineTimerRef.current);
  }, []);

  useEffect(() => {
    const runtimeMap = {};
    Object.values(cameraStatuses || {}).forEach((camera) => {
      if (camera?.zone_id) {
        runtimeMap[camera.zone_id] = normalizeServiceStatus(camera.status);
      }
    });
    if (Object.keys(runtimeMap).length > 0) {
      setCameraRuntimeMap(runtimeMap);
    }
  }, [cameraStatuses]);

  const handleStreamAuthFailure = useCallback((zoneId) => {
    if (!zoneId) return;
    if (!activeStreamZoneIds.has(zoneId)) return;
    refreshSingleToken(zoneId);
  }, [refreshSingleToken, activeStreamZoneIds]);

  const closeFocus = useCallback(() => {
    setFocusedCamera(null);
    setZoneEvents([]);
    setZoneAlerts([]);
    setIsDetailsOpen(false);
  }, []);

  const openFocus = useCallback(async (camera, triggerElement) => {
    lastFocusedTriggerRef.current = triggerElement || document.activeElement;
    setFocusedCamera(camera);
    try {
      const [eventsRes, alertsRes] = await Promise.all([
        api.get('/api/v1/events', {
          params: { page: 1, limit: 5, zone_id: camera.zone_id },
        }),
        api.get('/api/v1/alerts', {
          params: { page: 1, limit: 5, zone_id: camera.zone_id },
        }),
      ]);
      const eventsPayload = eventsRes?.data?.data ?? eventsRes?.data;
      const alertsPayload = alertsRes?.data?.data ?? alertsRes?.data;
      const eventsData = Array.isArray(eventsPayload) ? eventsPayload : eventsPayload?.events || [];
      const alertsData = Array.isArray(alertsPayload) ? alertsPayload : alertsPayload?.alerts || [];
      setZoneEvents(eventsData);
      setZoneAlerts(alertsData);
    } catch {
      setZoneEvents([]);
      setZoneAlerts([]);
    }
  }, []);

  useEffect(() => {
    if (!focusedCamera) return undefined;
    closeButtonRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeFocus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusedCamera, closeFocus]);

  const focusedStreamUrl = useMemo(() => {
    if (!focusedCamera?.zone_id) return null;
    const token = streamTokens[focusedCamera.zone_id]?.token;
    if (!token) return null;
    return `${API_BASE_URL}/api/v1/cameras/${focusedCamera.zone_id}/stream?token=${encodeURIComponent(token)}&session=${encodeURIComponent(streamSessionId)}`;
  }, [focusedCamera, streamTokens, streamSessionId]);

  const isDetectionEngineOnline = useMemo(() => {
    const subsystems = systemStatus?.subsystems;
    const freshness = subsystems?.detection_engine?.freshness_seconds;
    const threshold = subsystems?.detection_engine?.stale_threshold_seconds;
    if (typeof freshness === 'number' && typeof threshold === 'number') {
      return freshness <= threshold;
    }
    return detectionEngineStatus === 'online';
  }, [systemStatus, detectionEngineStatus]);

  const focusedHealth = useMemo(() => {
    if (!focusedCamera?.zone_id) return null;
    return cameraHealthMap[focusedCamera.zone_id] || null;
  }, [focusedCamera, cameraHealthMap]);

  useEffect(() => {
    if (!focusedCamera && lastFocusedTriggerRef.current?.focus) {
      lastFocusedTriggerRef.current.focus();
    }
  }, [focusedCamera]);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading camera feeds">
        <div className="flex items-center justify-between">
          <div className="skeleton h-4 w-36" />
          <div className="skeleton h-4 w-20" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="glass-subtle rounded-xl p-3 border border-white/10">
              <div className="skeleton aspect-video w-full rounded-lg" />
              <div className="mt-3 space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={() => fetchCameras({ forceLoading: true })}
          className="mt-3 px-4 py-1.5 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <p className="font-medium">No cameras registered.</p>
        <p className="text-sm mt-1">Add cameras via the backend admin panel.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-slate-50 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-800">
          Camera Feeds
          <span className="ml-2 text-xs text-slate-500 font-normal">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <button
          onClick={() => {
            fetchCameras({ forceLoading: true });
          }}
          className="text-xs text-slate-600 hover:text-slate-900 transition-colors focus-ring"
          title="Refresh cameras"
        >
          ↺ Refresh
        </button>
      </div>

      <div className={`grid ${gridColsClass} gap-4 transition-all duration-500 ease-in-out`}>
        {cameras.map((camera) => (
          <motion.div
            key={camera.zone_id || camera.id}
            layout
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.5, ease: 'easeInOut', delay: prefersReducedMotion ? 0 : 0.03 * (Number(camera.id) || 1) }}
            className="transition-all duration-500 ease-in-out"
          >
            <CameraCard
              camera={{
                ...camera,
                runtime_status: cameraRuntimeMap[camera.zone_id] || 'unknown',
                detection_engine_status: detectionEngineStatus,
                health: cameraHealthMap[camera.zone_id] || null,
                stream_token: streamTokens[camera.zone_id]?.token || null,
                stream_session_id: streamSessionId,
              }}
              onStreamAuthFailure={handleStreamAuthFailure}
              onFocus={(selectedCamera, triggerElement) => openFocus(selectedCamera, triggerElement)}
              shouldRenderStream={!focusedCamera && activeStreamZoneIds.has(camera.zone_id)}
              pausedReason={
                focusedCamera
                  ? 'Focus mode active'
                  : isDocumentVisible
                  ? 'Click to focus live stream'
                  : 'Paused in background tab'
              }
            />
          </motion.div>
        ))}
      </div>

      {focusedCamera && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Focused view for ${focusedCamera.zone_name || focusedCamera.zone_id}`}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeFocus(); }}
        >
          {/* Main cinematic container */}
          <div className="relative w-full h-full rounded-3xl overflow-hidden bg-black shadow-2xl">

            {/* Video / stream fill */}
            {!isDetectionEngineOnline ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 gap-4">
                <svg className="w-14 h-14 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span className="text-sm font-medium">Detection engine offline</span>
                <span className="text-xs text-slate-500">Live feed unavailable</span>
              </div>
            ) : focusedStreamUrl ? (
              <img
                src={focusedStreamUrl}
                alt={`Live feed — ${focusedCamera.zone_name || focusedCamera.zone_id}`}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
                Stream unavailable
              </div>
            )}

            {/* ── TOP OVERLAY ─────────────────────────────────── */}
            <div className="absolute top-0 left-0 w-full p-5 sm:p-6 flex justify-between items-start z-10 pointer-events-none">
              {/* Camera info */}
              <div className="pointer-events-auto">
                <div className="inline-flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]">
                  {focusedCamera.zone_name || focusedCamera.zone_id}
                </h3>
                <p className="text-sm text-white/70 mt-0.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
                  {focusedCamera.location_description || focusedCamera.zone_id}
                </p>
              </div>

              {/* Hamburger menu */}
              <button
                type="button"
                onClick={() => setIsDetailsOpen((v) => !v)}
                className="pointer-events-auto bg-transparent text-white hover:opacity-80 active:scale-95 transition-all p-2 rounded-full"
                aria-label="Toggle camera details panel"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* ── SLIDING DETAILS PANEL ──────────────────────── */}
            <motion.div
              initial={false}
              animate={{ x: isDetailsOpen ? 0 : '110%' }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, ease: [0.4, 0, 0.2, 1] }}
              className="absolute top-0 right-0 h-full w-72 sm:w-80 z-20 bg-white/10 backdrop-blur-2xl border-l border-white/10 p-6 flex flex-col gap-5 overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-widest text-white/50 font-semibold">Camera Details</p>
                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(false)}
                  className="text-white/60 hover:text-white transition-colors"
                  aria-label="Close details panel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Telemetry */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Telemetry</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">Zone</span>
                    <span className="text-white font-medium">{focusedCamera.zone_name || focusedCamera.zone_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Status</span>
                    <span className="text-emerald-300 font-medium capitalize">{normalizeServiceStatus(focusedHealth?.status || focusedCamera.runtime_status || 'unknown')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">FPS</span>
                    <span className="text-white font-medium">{typeof focusedHealth?.fps_actual === 'number' ? focusedHealth.fps_actual.toFixed(1) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">Resolution</span>
                    <span className="text-white font-medium">{focusedCamera.resolution || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Recent detections */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Recent Detections</p>
                <ul className="space-y-2">
                  {zoneEvents.length === 0 ? (
                    <li className="text-xs text-white/30">No recent detections</li>
                  ) : zoneEvents.map((ev) => (
                    <li key={ev.event_id || ev.id} className="text-xs text-white/70">
                      {formatDateTime(ev.timestamp || ev.detected_at)} — {ev.class_label || ev.class_name || 'Detection'}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recent alerts */}
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-3">Recent Alerts</p>
                <ul className="space-y-2">
                  {zoneAlerts.length === 0 ? (
                    <li className="text-xs text-white/30">No recent alerts</li>
                  ) : zoneAlerts.map((al) => (
                    <li key={al.alert_id || al.id} className="text-xs text-white/70">
                      <p className="font-medium text-white/90 capitalize">{al.status || 'unknown'}</p>
                      <p className="text-white/40">{formatDateTime(al.alerted_at || al.timestamp)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>

            {/* ── BOTTOM OVERLAY CONTROLS ───────────────────── */}
            <div className="absolute bottom-6 right-6 flex items-center gap-1 z-10">
              {/* Grid / multi-view icon */}
              <button
                type="button"
                onClick={() => setIsMultiViewOpen(true)}
                className="hover:bg-white/10 rounded-full p-2.5 text-white/70 hover:text-white transition-all active:scale-95"
                aria-label="Open all-cameras overview"
                title="All cameras"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </button>

              {/* Separator */}
              <span className="h-5 w-px border-l border-white/20 mx-1" />

              {/* Minimize / close icon */}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeFocus}
                className="hover:bg-white/10 rounded-full p-2.5 text-white/70 hover:text-white transition-all active:scale-95"
                aria-label="Close camera focus and return to camera grid"
                title="Minimize"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 9L4 4m0 0l5 0M4 4l0 5M15 9l5-5m0 0l-5 0m5 0l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5M15 15l5 5m0 0l-5 0m5 0l0-5" />
                </svg>
              </button>
            </div>

          </div>
        </motion.div>
      )}

      {/* ── MULTI-CAMERA OVERVIEW MODAL ───────────────────────── */}
      {isMultiViewOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="All cameras overview"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
          onClick={(e) => { if (e.target === e.currentTarget) setIsMultiViewOpen(false); }}
        >
          <div className="relative w-full h-full rounded-3xl overflow-hidden bg-black shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/40 font-semibold">All Cameras</p>
                <h3 className="text-lg font-bold text-white">
                  {cameras.length} Camera{cameras.length !== 1 ? 's' : ''} Active
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMultiViewOpen(false)}
                className="hover:bg-white/10 rounded-full p-2.5 text-white/60 hover:text-white transition-all active:scale-95"
                aria-label="Close all-cameras overview"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Camera grid — zero gap, fills all available height */}
            <div
              className={`flex-1 min-h-0 grid ${
                cameras.length === 1 ? 'grid-cols-1' :
                cameras.length === 2 ? 'grid-cols-2' :
                cameras.length <= 4 ? 'grid-cols-2' :
                'grid-cols-3'
              }`}
              style={{ gridAutoRows: '1fr' }}
            >
              {cameras.map((camera) => {
                const token = streamTokens[camera.zone_id]?.token;
                const streamUrl = token
                  ? `${API_BASE_URL}/api/v1/cameras/${camera.zone_id}/stream?token=${encodeURIComponent(token)}&session=${encodeURIComponent(streamSessionId)}`
                  : null;

                return (
                  <button
                    key={camera.zone_id || camera.id}
                    type="button"
                    onClick={() => { setIsMultiViewOpen(false); openFocus(camera); }}
                    className="relative overflow-hidden group cursor-pointer border-r border-b border-white/10 bg-slate-950 last:border-r-0"
                  >
                    {/* Stream fill */}
                    {streamUrl && isDetectionEngineOnline ? (
                      <img
                        src={streamUrl}
                        alt={`Live feed — ${camera.zone_name || camera.zone_id}`}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-700">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.724v6.552a1 1 0 01-1.447.894L15 14M4 8a1 1 0 00-1 1v6a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1H4z" />
                        </svg>
                      </div>
                    )}

                    {/* Label — no vignette, text-shadow for readability */}
                    <div className="absolute top-3 left-3 text-left pointer-events-none">
                      <p className="text-[10px] uppercase tracking-widest text-white/60 font-semibold leading-none mb-0.5 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                        {camera.zone_id}
                      </p>
                      <p className="text-sm font-bold text-white leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.9)]">
                        {camera.zone_name || camera.zone_id}
                      </p>
                    </div>

                    {/* Hover highlight */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ring-2 ring-inset ring-white/30" />
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default CameraGrid;
