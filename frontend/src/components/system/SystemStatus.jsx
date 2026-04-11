/**
 * AquaGuard — SystemStatus component (Ocean Theme)
 *
 * Displays real-time health indicators with ocean-themed styling.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { timeAgo } from '../../utils/dateFormat';
import { useSocketState, useSystemState } from '../../context/AlertContext.jsx';
import { normalizeServiceStatus } from '../../utils/statusHelpers';

const ESP32_ONLINE_THRESHOLD_SECONDS = 90;

function normalizeDetectionEnginePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'unknown', detail: '' };
  }

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

function StatusIndicator({ label, status, detail, icon }) {
  const isOnline =
    status === 'online' ||
    status === 'active' ||
    status === 'running' ||
    status === 'healthy' ||
    status === true;
  const isWarning = status === 'warning';

  return (
      <motion.div 
        className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isOnline ? 'bg-emerald-100' : isWarning ? 'bg-amber-100' : 'bg-rose-100'
          }`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{label}</p>
          {detail && <p className="text-xs text-slate-500 mt-0.5 truncate">{detail}</p>}
        </div>
      </div>
      <span
        className={`shrink-0 ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
          isOnline
            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
            : isWarning
            ? 'bg-amber-100 text-amber-700 border border-amber-200'
            : 'bg-rose-100 text-rose-700 border border-rose-200'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isOnline
              ? 'bg-emerald-400 animate-pulse'
              : isWarning
              ? 'bg-amber-400'
              : 'bg-rose-400'
          }`}
        />
        {isOnline ? 'Online' : isWarning ? 'Warning' : 'Offline'}
      </span>
    </motion.div>
  );
}

function SystemStatus() {
  const { cameraStatuses, cameraHealthMap, systemStatus } = useSystemState();
  const { socketConnected } = useSocketState();

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
  const degradedCameraCount = cameraEntries.filter((cam) => {
    const health = cameraHealthMap?.[cam.zone_id];
    return normalizeServiceStatus(health?.status) === 'degraded';
  }).length;

  return (
    <div className="space-y-3">
      {/* Socket Status */}
      <div className={`flex items-center justify-between rounded-2xl px-4 py-2.5 text-xs ${
        socketConnected 
          ? 'bg-emerald-100 border border-emerald-200' 
          : 'bg-amber-100 border border-amber-200'
      }`}>
        <span className="text-slate-600 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
          Socket
        </span>
        <span className={`font-semibold ${socketConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
          {socketConnected ? 'Connected' : 'Polling'}
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
              ? `${detectionFreshness}s ago`
              : 'Waiting…'
          )
        }
        icon={
          <svg className={`w-4 h-4 ${isDetectionStale ? 'text-amber-400' : 'text-emerald-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-.628.105a9.002 9.002 0 01-9.014 0l-.628-.105c-1.717-.293-2.299-2.379-1.067-3.611L5 14.5" />
          </svg>
        }
      />

      {/* ESP32 Device */}
      <StatusIndicator
        label="ESP32 Alarm"
        status={isEspStale ? 'warning' : (espOnline ? 'online' : 'offline')}
        detail={
          esp?.detail
            ? esp.detail
            : esp?.lastSeen
            ? timeAgo(esp.lastSeen)
            : (typeof espFreshness === 'number'
              ? `${espFreshness}s ago`
              : 'No heartbeat')
        }
        icon={
          <svg className={`w-4 h-4 ${espOnline && !isEspStale ? 'text-emerald-400' : isEspStale ? 'text-amber-400' : 'text-rose-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
          </svg>
        }
      />

      {/* Camera Summary */}
      <div className="flex gap-3 text-xs">
        <div className="flex-1 rounded-2xl bg-white border border-slate-200 p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{cameraEntries.length - staleCameraCount}</p>
          <p className="text-slate-500 mt-0.5">Online</p>
        </div>
        <div className="flex-1 rounded-2xl bg-white border border-slate-200 p-3 text-center shadow-sm">
          <p className={`text-2xl font-bold ${degradedCameraCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {degradedCameraCount}
          </p>
          <p className="text-slate-500 mt-0.5">Degraded</p>
        </div>
        <div className="flex-1 rounded-2xl bg-white border border-slate-200 p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-slate-800">{cameraEntries.length}</p>
          <p className="text-slate-500 mt-0.5">Total</p>
        </div>
      </div>

      {/* Camera statuses */}
      {cameraEntries.length === 0 ? (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-600 text-center">
          Waiting for camera status…
        </div>
      ) : (
        cameraEntries.map((cam) => (
          <StatusIndicator
            key={cam.zone_id}
            label={cam.zone_name || cam.zone_id}
            status={cam.status === 'online' ? 'online' : 'warning'}
            detail={`${cam.zone_id}${
              cameraHealthMap?.[cam.zone_id]?.fps_actual != null
                ? ` · ${Number(cameraHealthMap[cam.zone_id].fps_actual).toFixed(1)} FPS`
                : ''
            }${
              cameraHealthMap?.[cam.zone_id]?.corruption_rate != null
                ? ` · ${(Number(cameraHealthMap[cam.zone_id].corruption_rate) * 100).toFixed(1)}% corr.`
                : ''
            }`}
            icon={
              <svg className={`w-4 h-4 ${cam.status === 'online' ? 'text-emerald-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            }
          />
        ))
      )}
    </div>
  );
}

export default SystemStatus;
