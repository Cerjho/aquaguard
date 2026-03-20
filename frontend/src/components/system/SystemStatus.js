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

import React, { useMemo } from 'react';
import { timeAgo } from '../../utils/dateFormat';
import { useAlerts } from '../../context/AlertContext';

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

function normalizeEsp32Payload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const nested =
    payload.esp32
    || payload.esp32_status
    || payload.device_status?.esp32
    || null;

  if (!nested || typeof nested !== 'object') return null;

  const status = normalizeServiceStatus(
    nested.status ?? nested.state ?? nested.online
  );
  const lastSeen = nested.last_seen ?? nested.last_heartbeat ?? nested.last_heartbeat_at ?? nested.timestamp ?? null;
  const detail = nested.message ?? nested.detail ?? '';

  return { status, lastSeen, detail };
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
  const {
    cameraStatuses,
    systemStatus,
    socketConnected,
  } = useAlerts();

  const detection = useMemo(
    () => normalizeDetectionEnginePayload(systemStatus || {}),
    [systemStatus]
  );
  const cameraEntries = Object.values(cameraStatuses || {});
  const esp = useMemo(
    () => normalizeEsp32Payload(systemStatus || {}),
    [systemStatus]
  );
  const subsystems = systemStatus?.subsystems || {};
  const detectionFreshness = subsystems?.detection_engine?.freshness_seconds;
  const detectionStaleThreshold = subsystems?.detection_engine?.stale_threshold_seconds;
  const espFreshness = subsystems?.esp32?.freshness_seconds;
  const espStaleThreshold = subsystems?.esp32?.stale_threshold_seconds ?? ESP32_ONLINE_THRESHOLD_SECONDS;
  const isDetectionStale = (
    typeof detectionFreshness === 'number'
    && typeof detectionStaleThreshold === 'number'
    && detectionFreshness > detectionStaleThreshold
  );
  const isEspStale = (
    typeof espFreshness === 'number'
    && typeof espStaleThreshold === 'number'
    && espFreshness > espStaleThreshold
  );
  const espOnline = esp?.status === 'online' && !isEspStale;
  const staleCameraCount = cameraEntries.filter((cam) => cam.status !== 'online').length;

  return (
    <div className="space-y-3">
      <div className="text-xs flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-slate-600">Socket:</span>
        <span className={socketConnected ? 'text-green-700 font-semibold' : 'text-amber-700 font-semibold'}>
          {socketConnected ? 'Connected' : 'Disconnected (status polling only)'}
        </span>
      </div>

      {/* Detection Engine */}
      <StatusIndicator
        label="Detection Engine"
        status={isDetectionStale ? 'warning' : detection.status}
        detail={
          detection.message
          || detection.detail
          || (
            typeof detectionFreshness === 'number'
              ? `Freshness: ${detectionFreshness}s (threshold: ${detectionStaleThreshold}s)`
              : 'Waiting for status event…'
          )
        }
      />

      {/* ESP32 Device */}
      <StatusIndicator
        label="ESP32 Alarm Device"
        status={isEspStale ? 'warning' : (espOnline ? 'online' : 'offline')}
        detail={
          esp?.detail
            ? esp.detail
            : esp?.lastSeen
            ? `Last heartbeat: ${timeAgo(esp.lastSeen)}`
            : (typeof espFreshness === 'number'
              ? `Heartbeat freshness: ${espFreshness}s (threshold: ${espStaleThreshold}s)`
              : 'No heartbeat received yet')
        }
      />

      <div className="text-xs text-slate-500 px-1">
        Cameras online: {cameraEntries.length - staleCameraCount}/{cameraEntries.length}
      </div>

      {/* Camera statuses */}
      {cameraEntries.length === 0 ? (
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm text-sm text-slate-400">
          Waiting for camera status events…
        </div>
      ) : (
        cameraEntries.map((cam) => (
          <StatusIndicator
            key={cam.zone_id}
            label={cam.zone_name || cam.zone_id}
            status={cam.status === 'online' ? 'online' : 'warning'}
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
