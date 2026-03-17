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

function StatusIndicator({ label, status, detail }) {
  const isOnline = status === 'online' || status === 'active' || status === true;
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
    // payload: { zone_id, is_active, zone_name }
    if (payload && payload.zone_id) {
      setCameraStatuses((prev) => ({
        ...prev,
        [payload.zone_id]: payload,
      }));
    }
  }, []);

  const onSystemStatus = useCallback((payload) => {
    // payload: { status: 'online'|'offline', message }
    if (payload) {
      setDetectionEngineStatus(payload.status || 'unknown');
      setDetectionEngineDetail(payload.message || '');
    }
  }, []);

  useAlertSocket({ onCameraStatus, onSystemStatus });

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
            status={cam.is_active ? 'online' : 'offline'}
            detail={`Zone: ${cam.zone_id}`}
          />
        ))
      )}
    </div>
  );
}

export default SystemStatus;
