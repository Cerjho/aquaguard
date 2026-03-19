/**
 * AquaGuard — SystemStatus component.
 *
 * Displays real-time health indicators for:
 * 1. Camera status — from camera_status WebSocket events
 * 2. ESP32 device — online/offline based on last heartbeat in recent alerts
 * 3. Detection engine — from system_status WebSocket events
 *
 * Uses useAlertSocket directly to receive camera_status and system_status events.
 */

import React, { useState, useCallback, useEffect } from 'react';
import useAlertSocket from '../../hooks/useAlertSocket';
import api from '../../hooks/useApi';
import { timeAgo } from '../../utils/dateFormat';

const ESP32_ONLINE_THRESHOLD_SECONDS = 90;

function normalizeServiceStatus(rawStatus) {
  if (typeof rawStatus === 'boolean') return rawStatus ? 'online' : 'offline';
  if (!rawStatus) return 'unknown';

  const value = String(rawStatus).toLowerCase();
  if (['online', 'active', 'running', 'healthy', 'ok', 'connected'].includes(value)) {
    return 'online';
  }
  if (['offline', 'inactive', 'stopped', 'down', 'disconnected'].includes(value)) {
    return 'offline';
  }
  return value;
}

function normalizeDetectionEnginePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'unknown', detail: '' };
  }

  // Socket event shape can be:
  // { component: 'detection_engine', status, message }
  // Route shape can be:
  // { detection_engine: { status, message } }
  const nested =
    payload.detection_engine ||
    payload.detection_engine_status ||
    payload.engine ||
    payload.system_status ||
    null;

  const source = nested && typeof nested === 'object' ? nested : payload;

  const status = normalizeServiceStatus(source.status || source.state || source.engine_status);
  const detail =
    source.message ||
    source.detail ||
    source.reason ||
    source.last_error ||
    source.updated_at ||
    '';

  return { status, detail };
}

function normalizeCameraPayload(camera) {
  if (!camera || typeof camera !== 'object' || !camera.zone_id) return null;

  const normalizedStatus = normalizeServiceStatus(
    camera.status !== undefined ? camera.status : camera.is_active
  );

  return {
    zone_id: camera.zone_id,
    zone_name: camera.zone_name || camera.zone_id,
    status: normalizedStatus,
    last_snapshot_at: camera.last_snapshot_at || camera.last_snapshot || null,
    snapshot_age_seconds:
      typeof camera.snapshot_age_seconds === 'number' ? camera.snapshot_age_seconds : null,
  };
}

function normalizeCameraCollection(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.map(normalizeCameraPayload).filter(Boolean);

  if (typeof payload === 'object') {
    return Object.values(payload).map(normalizeCameraPayload).filter(Boolean);
  }

  return [];
}

function StatusIndicator({ label, status, detail }) {
  const isOnline =
    status === 'online' ||
    status === 'active' ||
    status === 'running' ||
    status === 'healthy' ||
    status === true;
  const isWarning = status === 'warning';

  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {detail && <p className="text-xs text-slate-400 mt-0.5 truncate">{detail}</p>}
      </div>
      <span
        className={`shrink-0 ml-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
          isOnline
            ? 'bg-green-100 text-green-700'
            : isWarning
            ? 'bg-yellow-100 text-yellow-700'
            : 'bg-red-100 text-red-600'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isOnline
              ? 'bg-green-500 animate-pulse'
              : isWarning
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}
        />
        {isOnline ? 'Online' : isWarning ? 'Warning' : 'Offline'}
      </span>
    </div>
  );
}

function SystemStatus() {
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [detectionEngineStatus, setDetectionEngineStatus] = useState('unknown');
  const [detectionEngineDetail, setDetectionEngineDetail] = useState('');
  const [esp32Online, setEsp32Online] = useState(false);
  const [esp32LastSeen, setEsp32LastSeen] = useState(null);
  const [esp32Error, setEsp32Error] = useState(null);

  // WebSocket handlers
  const onCameraStatus = useCallback((payload) => {
    const cameras = normalizeCameraCollection(payload);
    if (cameras.length > 0) {
      setCameraStatuses((prev) => {
        const next = { ...prev };
        cameras.forEach((cam) => {
          next[cam.zone_id] = cam;
        });
        return next;
      });
    }
  }, []);

  const onSystemStatus = useCallback((payload) => {
    const normalized = normalizeDetectionEnginePayload(payload);
    setDetectionEngineStatus(normalized.status);
    setDetectionEngineDetail(normalized.detail);
  }, []);

  useAlertSocket({ onCameraStatus, onSystemStatus });

  // Fetch initial runtime status so dashboard doesn't stay "unknown/offline"
  // when socket events are delayed.
  const fetchInitialRuntimeStatus = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/system/status');
      const data = res?.data || {};

      const detection = normalizeDetectionEnginePayload(data);
      setDetectionEngineStatus(detection.status);
      setDetectionEngineDetail(detection.detail);

      const cameraPayload =
        data.camera_status || data.camera_statuses || data.cameras || data.zones || [];
      const normalizedCameras = normalizeCameraCollection(cameraPayload);
      if (normalizedCameras.length > 0) {
        setCameraStatuses((prev) => {
          const next = { ...prev };
          normalizedCameras.forEach((cam) => {
            next[cam.zone_id] = cam;
          });
          return next;
        });
      }
    } catch {
      // Keep socket listeners active; component can still recover on next event.
    }
  }, []);

  // Poll alerts to determine ESP32 heartbeat freshness
  const checkEsp32 = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/alerts', {
        params: { limit: 1, page: 1 },
      });
      const alerts = Array.isArray(res.data) ? res.data : res.data.alerts || [];
      if (alerts.length > 0) {
        const latest = alerts[0];
        const ts = latest.alerted_at || latest.timestamp;
        if (ts) {
          const ageSeconds = (Date.now() - new Date(ts).getTime()) / 1000;
          setEsp32Online(ageSeconds <= ESP32_ONLINE_THRESHOLD_SECONDS);
          setEsp32LastSeen(ts);
        }
      }
      setEsp32Error(null);
    } catch {
      setEsp32Error('Could not reach backend.');
    }
  }, []);

  useEffect(() => {
    fetchInitialRuntimeStatus();
  }, [fetchInitialRuntimeStatus]);

  useEffect(() => {
    checkEsp32();
    const id = setInterval(checkEsp32, 30000);
    return () => clearInterval(id);
  }, [checkEsp32]);

  const cameraEntries = Object.values(cameraStatuses);

  return (
    <div className="space-y-3">
      {/* Detection Engine */}
      <StatusIndicator
        label="Detection Engine"
        status={detectionEngineStatus}
        detail={detectionEngineDetail || 'Waiting for status event…'}
      />

      {/* ESP32 Device */}
      <StatusIndicator
        label="ESP32 Alarm Device"
        status={esp32Online ? 'online' : 'offline'}
        detail={
          esp32Error
            ? esp32Error
            : esp32LastSeen
            ? `Last heartbeat: ${timeAgo(esp32LastSeen)}`
            : 'No heartbeat received yet'
        }
      />

      {/* Camera statuses — from WebSocket */}
      {cameraEntries.length === 0 ? (
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm text-sm text-slate-400">
          Waiting for camera status events…
        </div>
      ) : (
        cameraEntries.map((cam) => (
          <StatusIndicator
            key={cam.zone_id}
            label={cam.zone_name || cam.zone_id}
            status={cam.status}
            detail={`Zone: ${cam.zone_id}${
              cam.snapshot_age_seconds !== null ? ` • Snapshot age: ${cam.snapshot_age_seconds}s` : ''
            }${cam.last_snapshot_at ? ` • Last snapshot: ${timeAgo(cam.last_snapshot_at)}` : ''}`}
          />
        ))
      )}
    </div>
  );
}

export default SystemStatus;
