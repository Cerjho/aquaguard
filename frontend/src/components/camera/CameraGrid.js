/**
 * AquaGuard — CameraGrid component.
 *
 * Fetches all camera zones from GET /api/v1/cameras and renders
 * a responsive grid of CameraCard tiles.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api from '../../hooks/useApi';
import CameraCard from './CameraCard';
import { useAlerts } from '../../context/AlertContext';
import { formatDateTime } from '../../utils/dateFormat';
import { API_BASE_URL } from '../../utils/constants';

const STREAM_TOKEN_REFRESH_BUFFER_SECONDS = 5;
const STREAM_REFRESH_CHECK_MS = 5000;
const HIDDEN_TOKEN_REFRESH_CHECK_MS = 20000;
const MAX_GRID_STREAMS = 4;

function CameraGrid({ reloadToken = 0 }) {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  const { cameraStatuses, systemStatus } = useAlerts();
  const closeButtonRef = useRef(null);
  const lastFocusedTriggerRef = useRef(null);
  const wasDocumentHiddenRef = useRef(typeof document !== 'undefined' ? document.hidden : false);

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

  const normalizeStatus = (value) => {
    if (typeof value === 'boolean') return value ? 'online' : 'offline';
    if (!value) return 'unknown';
    const lowered = String(value).toLowerCase();
    if (['online', 'active', 'running', 'healthy'].includes(lowered)) return 'online';
    if (['offline', 'inactive', 'stopped', 'down'].includes(lowered)) return 'offline';
    return lowered;
  };

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/cameras');
      // Backend returns { cameras: [...] } or directly an array
      const data = Array.isArray(res.data) ? res.data : res.data.cameras || [];
      setCameras(data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Failed to load cameras. Is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const mintStreamToken = useCallback(async (zoneId) => {
    if (!zoneId) return null;
    try {
      const res = await api.post(`/api/v1/cameras/${zoneId}/stream-token`);
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

  const fetchRuntimeStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/system/status');
      const payload = res.data || {};
      const engine = payload.detection_engine || {};
      setDetectionEngineStatus(normalizeStatus(engine.status));

      const runtimeCameras = payload.camera_status || payload.cameras || [];
      const runtimeMap = {};
      if (Array.isArray(runtimeCameras)) {
        runtimeCameras.forEach((camera) => {
          if (camera?.zone_id) {
            runtimeMap[camera.zone_id] = normalizeStatus(camera.status);
          }
        });
      }
      setCameraRuntimeMap(runtimeMap);
    } catch {
      setDetectionEngineStatus('unknown');
      setCameraRuntimeMap({});
    }
  }, []);

  const refreshSingleToken = useCallback(async (zoneId) => {
    const tokenMeta = await mintStreamToken(zoneId);
    if (!tokenMeta?.token) return;
    setStreamTokens((prev) => ({
      ...prev,
      [zoneId]: tokenMeta,
    }));
  }, [mintStreamToken]);

  useEffect(() => {
    fetchCameras();
    fetchRuntimeStatus();
  }, [fetchCameras, fetchRuntimeStatus, reloadToken]);

  const activeStreamZoneIds = useMemo(() => {
    if (!Array.isArray(cameras) || cameras.length === 0) return new Set();
    if (focusedCamera?.zone_id) return new Set([focusedCamera.zone_id]);
    if (!isDocumentVisible) return new Set();
    const prioritized = cameras
      .filter((camera) => {
        const runtime = normalizeStatus(cameraRuntimeMap[camera.zone_id] ?? camera.is_active);
        return runtime === 'online';
      })
      .slice(0, MAX_GRID_STREAMS)
      .map((camera) => camera.zone_id);
    return new Set(prioritized);
  }, [cameras, focusedCamera, isDocumentVisible, cameraRuntimeMap]);

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
      setDetectionEngineStatus(normalizeStatus(systemStatus.detection_engine.status));
    }
  }, [systemStatus]);

  useEffect(() => {
    const runtimeMap = {};
    Object.values(cameraStatuses || {}).forEach((camera) => {
      if (camera?.zone_id) {
        runtimeMap[camera.zone_id] = normalizeStatus(camera.status);
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

  useEffect(() => {
    if (!focusedCamera && lastFocusedTriggerRef.current?.focus) {
      lastFocusedTriggerRef.current.focus();
    }
  }, [focusedCamera]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <svg
            className="animate-spin h-8 w-8 text-sky-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Loading cameras…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchCameras}
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
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-700">
          Camera Feeds
          <span className="ml-2 text-xs text-slate-400 font-normal">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <button
          onClick={() => {
            fetchCameras();
            fetchRuntimeStatus();
          }}
          className="text-xs text-sky-600 hover:text-sky-800 transition-colors"
          title="Refresh cameras"
        >
          ↺ Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <CameraCard
            key={camera.zone_id || camera.id}
            camera={{
              ...camera,
              runtime_status: cameraRuntimeMap[camera.zone_id] || 'unknown',
              detection_engine_status: detectionEngineStatus,
              stream_token: streamTokens[camera.zone_id]?.token || null,
              stream_session_id: streamSessionId,
            }}
            onStreamAuthFailure={handleStreamAuthFailure}
            onFocus={(selectedCamera) => openFocus(selectedCamera, document.activeElement)}
            shouldRenderStream={!focusedCamera && activeStreamZoneIds.has(camera.zone_id)}
            pausedReason={
              focusedCamera
                ? 'Focus mode active'
                : isDocumentVisible
                ? 'Click to focus live stream'
                : 'Paused in background tab'
            }
          />
        ))}
      </div>

      {focusedCamera && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Focused view for ${focusedCamera.zone_name || focusedCamera.zone_id}`}
          className="fixed inset-0 z-50 bg-slate-950/80 p-2 sm:p-4 md:p-6"
        >
          <div className="h-full w-full rounded-xl bg-white border border-slate-200 shadow-xl overflow-auto">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur px-3 sm:px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Focused camera</p>
                  <h3 className="text-base sm:text-lg font-semibold text-slate-900">{focusedCamera.zone_name || focusedCamera.zone_id}</h3>
                  <p className="text-xs text-slate-500">{focusedCamera.location_description || focusedCamera.zone_id}</p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeFocus}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm border border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  aria-label="Close camera focus and return to camera grid"
                >
                  <span aria-hidden="true">←</span>
                  Back to grid
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 p-3 sm:p-4">
              <div className="xl:col-span-8 rounded-lg overflow-hidden bg-slate-900 aspect-video min-h-[240px] sm:min-h-[320px]">
                {focusedStreamUrl ? (
                  <img
                    src={focusedStreamUrl}
                    alt={`Focused live feed — ${focusedCamera.zone_name || focusedCamera.zone_id}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-300 text-sm">Stream unavailable</div>
                )}
              </div>
              <div className="xl:col-span-4 space-y-4">
                <section className="rounded-lg border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent detections</h4>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    {zoneEvents.length === 0 ? <li>No recent detections</li> : zoneEvents.map((ev) => (
                      <li key={ev.event_id || ev.id}>{formatDateTime(ev.timestamp || ev.detected_at)} — {(ev.class_label || ev.class_name || 'Detection')}</li>
                    ))}
                  </ul>
                </section>
                <section className="rounded-lg border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent alerts</h4>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    {zoneAlerts.length === 0 ? <li>No recent alerts</li> : zoneAlerts.map((al) => (
                      <li key={al.alert_id || al.id}>{formatDateTime(al.alerted_at || al.timestamp)} — {(al.status || 'unknown')}</li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraGrid;
