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

const ESP32_ONLINE_THRESHOLD_SECONDS = 30;

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
        className="flex items-center justify-between p-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800/80 transition-colors shadow-sm"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className={`w-7 h-7 rounded border flex items-center justify-center ${
            isOnline ? 'bg-emerald-500/10 border-emerald-500/30' : isWarning ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30'
          }`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-mono font-semibold text-slate-300 uppercase tracking-wide">{label}</p>
          {detail && <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{detail}</p>}
        </div>
      </div>
      <span
        className={`shrink-0 ml-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest ${
          isOnline
            ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
            : isWarning
            ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
            : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-sm ${
            isOnline
              ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse'
              : isWarning
              ? 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.8)]'
              : 'bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.8)] animate-pulse'
          }`}
        />
        {isOnline ? 'ONLINE' : isWarning ? 'WARN' : 'OFFLINE'}
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
  const espExplicitlyOffline = esp?.status === 'offline';
  const isDetectionStale = (
    typeof detectionFreshness === 'number'
    && typeof detectionStaleThreshold === 'number'
    && detectionFreshness > detectionStaleThreshold
  );
  const isEspStale = (
    !espExplicitlyOffline
    && esp?.status === 'online'
    &&
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
      : 0);
  const showDashboardDiagnostics = showCameraIndicators && !showCameraStatusList;
  const onlineRatio = cameraEntries.length > 0 ? (onlineCameraCount / cameraEntries.length) * 100 : 0;

  if (showDashboardDiagnostics) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#0a0f18] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">System Diagnostics</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-500">
              Network &amp; Core
            </p>
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
              <div className="flex items-center justify-between rounded bg-slate-950 px-2.5 py-2 border border-slate-800/50">
                <span className="text-[11px] font-mono text-slate-400 uppercase">API Uplink</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-sm ${
                      apiOnline
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                        : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    }`}
                  />
                  <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${apiOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {apiOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded bg-slate-950 px-2.5 py-2 border border-slate-800/50">
                <span className="text-[11px] font-mono text-slate-400 uppercase">WebSocket</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-sm ${
                      socketConnected
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                        : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    }`}
                  />
                  <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${socketConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {socketConnected ? 'SYNCED' : 'DROPPED'}
                  </span>
                </div>
              </div>

              <div className="rounded bg-slate-950 px-2.5 py-2.5 border border-slate-800/50">
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">AI Engine</p>
                <div className="mt-1 flex items-end justify-between">
                  <p className="text-lg font-mono font-bold text-slate-200">{aiDetectionCount.toLocaleString()}</p>
                  <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${aiOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {aiOnline ? 'ACTIVE' : 'HALTED'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-500">
              Hardware Edge
            </p>
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
              <div className="rounded bg-slate-950 px-2.5 py-2.5 border border-slate-800/50">
                <div className="mb-2 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400 uppercase">Cameras</span>
                  <span className="font-bold text-slate-300 tracking-wider">
                    {onlineCameraCount}/{cameraEntries.length} ON
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)] transition-all"
                    style={{ width: `${onlineRatio}%` }}
                  />
                </div>
                <p className={`mt-2 text-[10px] font-mono uppercase tracking-widest font-bold ${staleCameraCount > 0 ? 'text-rose-500' : degradedCameraCount > 0 ? 'text-amber-500' : 'text-slate-500'}`}>
                  {staleCameraCount > 0 ? `${staleCameraCount} OFFLINE` : degradedCameraCount > 0 ? `${degradedCameraCount} DEGRADED` : 'ALL STREAMS OK'}
                </p>
              </div>

              <div className="flex items-center justify-between rounded bg-slate-950 px-2.5 py-2 border border-slate-800/50">
                <div className="flex items-center gap-2.5">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded border ${espOnline ? 'bg-emerald-500/10 border-emerald-500/30' : isEspStale ? 'bg-amber-500/10 border-amber-500/30' : 'bg-rose-500/10 border-rose-500/30'}`}>
                    <svg
                      className={`h-3 w-3 ${espOnline ? 'text-emerald-500' : isEspStale ? 'text-amber-500' : 'text-rose-500'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
                    </svg>
                  </span>
                  <div>
                    <p className="text-[11px] font-mono font-bold text-slate-300 uppercase">ESP32 Alarm</p>
                    <p className="text-[10px] font-mono text-slate-500 uppercase">
                      {esp?.detail
                        ? esp.detail
                        : esp?.lastSeen
                        ? timeAgo(esp.lastSeen)
                        : (typeof espFreshness === 'number' ? `${espFreshness}s AGO` : 'NO LINK')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-sm ${
                      espOnline
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                        : isEspStale
                        ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                        : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    }`}
                  />
                  <span className={`text-[10px] font-mono font-bold tracking-wider uppercase ${espOnline ? 'text-emerald-500' : isEspStale ? 'text-amber-500' : 'text-rose-500'}`}>
                    {espOnline ? 'LINKED' : isEspStale ? 'STALE' : 'LOST'}
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
        <div className="sm:col-span-1 rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-sm ${apiOnline ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-rose-500'}`} />
            API
          </div>
          <p className={`mt-2 text-sm font-mono font-bold tracking-wider ${apiOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
            {apiOnline ? 'ONLINE' : 'OFFLINE'}
          </p>
        </div>
        <div className="sm:col-span-1 rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-sm ${socketConnected ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-rose-500'}`} />
            WebSocket
          </div>
          <p className={`mt-2 text-sm font-mono font-bold tracking-wider ${socketConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
            {socketConnected ? 'SYNCED' : 'DROPPED'}
          </p>
        </div>
        <div className="sm:col-span-2 rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-sm">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-sm ${aiOnline ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-rose-500'}`} />
            AI Engine
          </div>
          <p className="mt-2 text-sm font-mono font-bold text-slate-300">
            Detections: <span className={aiOnline ? 'text-emerald-500' : 'text-rose-500'}>{aiDetectionCount}</span>
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
            <div className="flex-1 rounded-lg bg-slate-900 border border-slate-800 p-3 shadow-sm">
              <div className="flex min-h-[76px] flex-col items-center justify-center text-center">
                <p className="text-2xl font-mono font-bold leading-none text-emerald-500">{onlineCameraCount}</p>
                <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">Online</p>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-slate-900 border border-slate-800 p-3 shadow-sm">
              <div className="flex min-h-[76px] flex-col items-center justify-center text-center">
                <p className={`text-2xl font-mono font-bold leading-none ${degradedCameraCount > 0 ? 'text-amber-500' : 'text-slate-300'}`}>
                  {degradedCameraCount}
                </p>
                <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">Degraded</p>
              </div>
            </div>
            <div className="flex-1 rounded-lg bg-slate-900 border border-slate-800 p-3 shadow-sm">
              <div className="flex min-h-[76px] flex-col items-center justify-center text-center">
                <p className="text-2xl font-mono font-bold leading-none text-slate-300">{cameraEntries.length}</p>
                <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-slate-500">Total</p>
              </div>
            </div>
          </div>

          {/* Camera statuses */}
          {showCameraStatusList && (
            cameraEntries.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-xs font-mono uppercase tracking-widest text-slate-500 text-center">
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
