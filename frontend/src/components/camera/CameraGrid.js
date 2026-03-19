/**
 * AquaGuard — CameraGrid component.
 *
 * Fetches all camera zones from GET /api/v1/cameras and renders
 * a responsive grid of CameraCard tiles.
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '../../hooks/useApi';
import CameraCard from './CameraCard';
import { useAlerts } from '../../context/AlertContext';

const STREAM_TOKEN_REFRESH_BUFFER_SECONDS = 5;
const STREAM_REFRESH_CHECK_MS = 5000;

function CameraGrid() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detectionEngineStatus, setDetectionEngineStatus] = useState('unknown');
  const [cameraRuntimeMap, setCameraRuntimeMap] = useState({});
  const [streamTokens, setStreamTokens] = useState({});
  const { cameraStatuses, systemStatus } = useAlerts();

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
  }, [fetchCameras, fetchRuntimeStatus]);

  useEffect(() => {
    mintStreamTokensForCameras(cameras);
  }, [cameras, mintStreamTokensForCameras]);

  useEffect(() => {
    if (!Array.isArray(cameras) || cameras.length === 0) return undefined;
    const intervalId = setInterval(() => {
      const now = Date.now();
      cameras.forEach((camera) => {
        const zoneId = camera?.zone_id;
        if (!zoneId) return;
        const meta = streamTokens[zoneId];
        if (!meta?.expiresAt) return;
        const expiresInMs = meta.expiresAt - now;
        if (expiresInMs <= STREAM_TOKEN_REFRESH_BUFFER_SECONDS * 1000) {
          refreshSingleToken(zoneId);
        }
      });
    }, STREAM_REFRESH_CHECK_MS);
    return () => clearInterval(intervalId);
  }, [cameras, streamTokens, refreshSingleToken]);

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
    refreshSingleToken(zoneId);
  }, [refreshSingleToken]);

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
            }}
            onStreamAuthFailure={handleStreamAuthFailure}
          />
        ))}
      </div>
    </div>
  );
}

export default CameraGrid;
