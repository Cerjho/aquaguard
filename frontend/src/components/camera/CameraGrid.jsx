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
      const token = (
        res?.data?.stream_token
        || res?.data?.token
        || res?.data?.access_token
        || null
      );
      if (!token) return null;

      const ttlSeconds = Number(
        res?.data?.ttl_seconds
        ?? res?.data?.expires_in_seconds
        ?? 30
      );
      const expiresAt = res?.data?.expires_at
        ? new Date(res.data.expires_at).getTime()
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
    if (systemStatus?.detection_engine?.status) {
      setDetectionEngineStatus(normalizeServiceStatus(systemStatus.detection_engine.status));
    }
  }, [systemStatus]);

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
      const eventsData = Array.isArray(eventsRes.data) ? eventsRes.data : eventsRes.data.events || [];
      const alertsData = Array.isArray(alertsRes.data) ? alertsRes.data : alertsRes.data.alerts || [];
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
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
        >
          <div className="mx-auto h-full max-h-[94vh] w-full max-w-7xl rounded-3xl bg-white/95 backdrop-blur-2xl border border-[#e7ecef] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between border-b border-[#e7ecef] px-5 sm:px-7 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-semibold">Focused camera</p>
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900">
                  {focusedCamera.zone_name || focusedCamera.zone_id}
                </h3>
                <p className="text-xs text-slate-500">{focusedCamera.location_description || focusedCamera.zone_id}</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeFocus}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:scale-105 active:scale-95 transition-all"
                aria-label="Close camera focus and return to camera grid"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 p-5 sm:p-7 h-[calc(94vh-76px)]">
              <div className="xl:col-span-8 rounded-3xl overflow-hidden border border-[#e7ecef] bg-slate-900 relative min-h-[320px]">
                <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full bg-emerald-100/95 text-emerald-700 px-3 py-1 text-xs font-semibold shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>

                {!isDetectionEngineOnline ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                    <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <span className="text-sm font-medium">Detection engine offline</span>
                    <span className="text-xs text-slate-400">Live snapshots unavailable</span>
                  </div>
                ) : focusedStreamUrl ? (
                  <img
                    src={focusedStreamUrl}
                    alt={`Focused live feed — ${focusedCamera.zone_name || focusedCamera.zone_id}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-300 text-sm">Stream unavailable</div>
                )}
              </div>

              <div className="xl:col-span-4 h-full overflow-hidden rounded-3xl border border-[#e7ecef] bg-white shadow-sm p-4 sm:p-5 flex flex-col gap-5">
                <section className="rounded-2xl border border-[#e7ecef] bg-[#a3cef1]/10 p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Telemetry</h4>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p><span className="text-slate-500">Zone:</span> {focusedCamera.zone_name || focusedCamera.zone_id}</p>
                    <p><span className="text-slate-500">Health:</span> {normalizeServiceStatus(focusedHealth?.status || focusedCamera.runtime_status || 'unknown')}</p>
                    <p><span className="text-slate-500">FPS:</span> {typeof focusedHealth?.fps_actual === 'number' ? focusedHealth.fps_actual.toFixed(1) : '—'}</p>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recent detections</p>
                    <ul className="text-xs text-slate-600 space-y-1.5">
                      {zoneEvents.length === 0 ? <li>No recent detections</li> : zoneEvents.map((ev) => (
                        <li key={ev.event_id || ev.id}>
                          {formatDateTime(ev.timestamp || ev.detected_at)} — {(ev.class_label || ev.class_name || 'Detection')}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="flex-1 min-h-0 rounded-2xl border border-[#e7ecef] bg-[#ffffff] p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Recent alerts</h4>
                  <ul className="space-y-2 max-h-full overflow-y-auto pr-1">
                    {zoneAlerts.length === 0 ? (
                      <li className="text-xs text-slate-500">No recent alerts</li>
                    ) : zoneAlerts.map((al) => (
                      <li
                        key={al.alert_id || al.id}
                        className="p-3 text-xs text-slate-700 transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:bg-white border border-transparent hover:border-slate-100 rounded-xl cursor-pointer"
                      >
                        <p className="font-medium text-slate-900">{al.status || 'unknown'}</p>
                        <p className="mt-1 text-slate-500">{formatDateTime(al.alerted_at || al.timestamp)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default CameraGrid;
