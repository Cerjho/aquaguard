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

function SystemStatus({ showCameraIndicators = true, showCameraStatusList = true }) {
  const { cameraStatuses, cameraHealthMap, systemStatus, apiStatus } = useSystemState();
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
  const onlineCameraCount = cameraEntries.length - staleCameraCount;
  const apiOnline = apiStatus?.connected === true;
  const aiOnline = !isDetectionStale && (
    detection.status === 'online'
    || detection.status === 'active'
    || detection.status === 'running'
    || detection.status === 'healthy'
  );
  const aiDetectionCount = Array.isArray(systemStatus?.recent_detections)
    ? systemStatus.recent_detections.length
    : (typeof systemStatus?.detection_count === 'number'
      ? systemStatus.detection_count
      : (typeof detectionFreshness === 'number' ? detectionFreshness : 0));
  const showDashboardDiagnostics = showCameraIndicators && !showCameraStatusList;
  const onlineRatio = cameraEntries.length > 0 ? (onlineCameraCount / cameraEntries.length) * 100 : 0;

  if (showDashboardDiagnostics) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-tight text-slate-800">System Diagnostics</h3>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
            SYSTEM SECURE
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Network &amp; AI
            </p>
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5">
                <span className="text-xs font-medium text-slate-500">API</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      apiOnline
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className={`text-xs font-semibold ${apiOnline ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {apiOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5">
                <span className="text-xs font-medium text-slate-500">Socket</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      socketConnected
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className={`text-xs font-semibold ${socketConnected ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {socketConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg bg-white px-3 py-3">
                <p className="text-[11px] uppercase tracking-wider text-slate-400">AI Detections</p>
                <div className="mt-1 flex items-end justify-between">
                  <p className="text-xl font-bold text-slate-800">{aiDetectionCount}</p>
                  <span className={`text-xs font-semibold ${aiOnline ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {aiOnline ? 'Live' : 'Degraded'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Hardware Edge
            </p>
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <div className="rounded-lg bg-white px-3 py-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Cameras</span>
                  <span className="font-semibold text-slate-700">
                    {onlineCameraCount} / {cameraEntries.length} Online
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${onlineRatio}%` }}
                  />
                </div>
                <p className={`mt-2 text-[11px] font-semibold ${degradedCameraCount > 0 ? 'text-amber-500' : 'text-slate-500'}`}>
                  {degradedCameraCount > 0 ? `${degradedCameraCount} degraded` : 'All camera streams healthy'}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${espOnline ? 'bg-emerald-50' : isEspStale ? 'bg-amber-50' : 'bg-rose-50'}`}>
                    <svg
                      className={`h-4 w-4 ${espOnline ? 'text-emerald-500 animate-pulse' : isEspStale ? 'text-amber-500' : 'text-rose-500'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-xs font-medium text-slate-500">ESP32 Alarm</p>
                    <p className="text-xs text-slate-500">
                      {esp?.detail
                        ? esp.detail
                        : esp?.lastSeen
                        ? timeAgo(esp.lastSeen)
                        : (typeof espFreshness === 'number' ? `${espFreshness}s ago` : 'No heartbeat')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      espOnline
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'
                        : isEspStale
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className={`text-xs font-semibold ${espOnline ? 'text-emerald-600' : isEspStale ? 'text-amber-500' : 'text-rose-600'}`}>
                    {espOnline ? 'Online' : isEspStale ? 'Stale' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${apiOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            API
          </div>
          <p className={`mt-2 text-sm font-semibold ${apiOnline ? 'text-emerald-700' : 'text-rose-600'}`}>
            {apiOnline ? 'Online' : 'Offline'}
          </p>
        </div>
        <div className="sm:col-span-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            Socket
          </div>
          <p className={`mt-2 text-sm font-semibold ${socketConnected ? 'text-emerald-700' : 'text-rose-600'}`}>
            {socketConnected ? 'Online' : 'Offline'}
          </p>
        </div>
        <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full ${aiOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            AI
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            Detections: <span className={aiOnline ? 'text-emerald-700' : 'text-rose-600'}>{aiDetectionCount}</span>
          </p>
        </div>
      </div>

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

      {showCameraIndicators && (
        <>
          {/* Camera Summary */}
          <div className="flex gap-3 text-xs">
            <div className="flex-1 rounded-2xl bg-white border border-slate-200 p-3 shadow-sm">
              <div className="flex min-h-[76px] flex-col items-center justify-center text-center">
                <p className="text-2xl font-bold leading-none text-emerald-600">{onlineCameraCount}</p>
                <p className="mt-1 text-slate-500">Online</p>
              </div>
            </div>
            <div className="flex-1 rounded-2xl bg-white border border-slate-200 p-3 shadow-sm">
              <div className="flex min-h-[76px] flex-col items-center justify-center text-center">
                <p className={`text-2xl font-bold leading-none ${degradedCameraCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                  {degradedCameraCount}
                </p>
                <p className="mt-1 text-slate-500">Degraded</p>
              </div>
            </div>
            <div className="flex-1 rounded-2xl bg-white border border-slate-200 p-3 shadow-sm">
              <div className="flex min-h-[76px] flex-col items-center justify-center text-center">
                <p className="text-2xl font-bold leading-none text-slate-800">{cameraEntries.length}</p>
                <p className="mt-1 text-slate-500">Total</p>
              </div>
            </div>
          </div>

          {/* Camera statuses */}
          {showCameraStatusList && (
            cameraEntries.length === 0 ? (
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
            )
          )}
        </>
      )}
    </div>
  );
}

export default SystemStatus;
