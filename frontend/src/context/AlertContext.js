/**
 * AquaGuard — Alert Context
 *
 * Manages global alert state fed from the WebSocket.
 * Provides: activeAlert, alertHistory, unacknowledgedCount, acknowledge()
 *
 * The AlertProvider MUST be nested inside AuthProvider (uses localStorage token
 * for the socket connection).
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import useAlertSocket from '../hooks/useAlertSocket';
import api from '../hooks/useApi';

const AlertContext = createContext(null);
const MAX_DETECTION_EVENTS = 50;
const STATUS_POLL_INTERVAL_MS = 15000;

const DEFAULT_TRIAGE_FILTERS = {
  zone_id: '',
  status: '',
  min_confidence: '',
  from: '',
  to: '',
};

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

/**
 * Resolve alert ID from multiple legacy/new payload shapes.
 * Canonical ID in the app is always `alert_id`.
 */
function resolveAlertId(payloadOrId) {
  if (payloadOrId == null) return null;

  if (typeof payloadOrId === 'string' || typeof payloadOrId === 'number') {
    return String(payloadOrId);
  }

  if (typeof payloadOrId !== 'object') return null;

  return (
    payloadOrId.alert_id
    || payloadOrId.id
    || payloadOrId.alert?.alert_id
    || payloadOrId.alert?.id
    || null
  );
}

/**
 * Normalize incoming socket payload into one frontend contract.
 * Keeps backward-compatible aliases while guaranteeing canonical fields.
 */
function normalizeAlertPayload(payload = {}) {
  const normalized = { ...payload };
  const canonicalAlertId = resolveAlertId(payload);

  const confidence = (
    payload.confidence
    ?? payload.final_confidence
    ?? payload.confidence_score
    ?? payload.alert?.confidence
    ?? payload.alert?.final_confidence
    ?? payload.alert?.confidence_score
    ?? null
  );

  const alertedAt = (
    payload.alerted_at
    ?? payload.triggered_at
    ?? payload.timestamp
    ?? payload.detected_at
    ?? payload.alert?.alerted_at
    ?? payload.alert?.triggered_at
    ?? payload.alert?.timestamp
    ?? payload.alert?.detected_at
    ?? null
  );

  const snapshotPath = (
    payload.snapshot_url
    ?? payload.alert?.snapshot_url
    ?? payload.frame_snapshot_path
    ?? payload.snapshot_path
    ?? payload.alert?.frame_snapshot_path
    ?? payload.alert?.snapshot_path
    ?? null
  );

  return {
    ...normalized,
    alert_id: canonicalAlertId,
    // Keep `id` available for legacy component assumptions, but align it with canonical ID.
    id: canonicalAlertId || normalized.id,
    confidence,
    alerted_at: alertedAt,
    frame_snapshot_path: snapshotPath,
  };
}

export function AlertProvider({ children }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState(null);
  const [acknowledgeError, setAcknowledgeError] = useState(null);

  const [detectionEvents, setDetectionEvents] = useState([]);
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [systemStatus, setSystemStatus] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketMeta, setSocketMeta] = useState(null);

  const [triageFilters, setTriageFiltersState] = useState(DEFAULT_TRIAGE_FILTERS);

  const setTriageFilters = useCallback((next) => {
    setTriageFiltersState((prev) => {
      if (typeof next === 'function') return next(prev);
      return { ...prev, ...next };
    });
  }, []);

  const resetTriageFilters = useCallback(() => {
    setTriageFiltersState(DEFAULT_TRIAGE_FILTERS);
  }, []);

  // Keep a stable reference to the callbacks so the socket hook doesn't reconnect
  const onAlert = useCallback((payload) => {
    const normalizedPayload = normalizeAlertPayload(payload);
    setActiveAlert(normalizedPayload);
    setAlertHistory((prev) => [normalizedPayload, ...prev]);
    setUnacknowledgedCount((c) => c + 1);
  }, []);

  const onDetectionEvent = useCallback((payload) => {
    if (!payload) return;
    setDetectionEvents((prev) => {
      const merged = [payload, ...prev];
      const unique = [];
      const seen = new Set();
      merged.forEach((event) => {
        const key = event.event_id || event.id || event.timestamp || JSON.stringify(event);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(event);
        }
      });
      return unique.slice(0, MAX_DETECTION_EVENTS);
    });
  }, []);

  const onCameraStatus = useCallback((payload) => {
    const incoming = Array.isArray(payload) ? payload : [payload];
    setCameraStatuses((prev) => {
      const next = { ...prev };
      incoming.forEach((camera) => {
        if (!camera || !camera.zone_id) return;
        next[camera.zone_id] = {
          zone_id: camera.zone_id,
          zone_name: camera.zone_name || camera.zone_id,
          status: normalizeServiceStatus(camera.status ?? camera.is_active),
          snapshot_age_seconds:
            typeof camera.snapshot_age_seconds === 'number' ? camera.snapshot_age_seconds : null,
          last_snapshot_at: camera.last_snapshot_at || null,
        };
      });
      return next;
    });
  }, []);

  const onSystemStatus = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return;
    setSystemStatus((prev) => {
      const current = prev || {};
      return {
        ...current,
        detection_engine: {
          ...(current.detection_engine || {}),
          ...(payload.detection_engine || {}),
          status: normalizeServiceStatus(
            payload?.detection_engine?.status
            || payload?.status
            || current?.detection_engine?.status
          ),
          message:
            payload?.detection_engine?.message
            || payload?.message
            || current?.detection_engine?.message
            || '',
        },
        generated_at: payload.generated_at || current.generated_at || null,
        subsystems: payload.subsystems || current.subsystems || null,
      };
    });
  }, []);

  const onConnectionChange = useCallback((connected, meta) => {
    setSocketConnected(Boolean(connected));
    setSocketMeta(meta || null);
  }, []);

  // Connect WebSocket
  useAlertSocket({
    onAlert,
    onDetectionEvent,
    onCameraStatus,
    onSystemStatus,
    onConnectionChange,
  });

  const refreshSystemStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/v1/system/status');
      const payload = response?.data || {};
      setSystemStatus(payload);
      if (Array.isArray(payload.camera_status)) {
        onCameraStatus(payload.camera_status);
      }
    } catch {
      // Silent fallback; socket updates may still keep UI fresh
    }
  }, [onCameraStatus]);

  useEffect(() => {
    refreshSystemStatus();
    const intervalId = setInterval(refreshSystemStatus, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [refreshSystemStatus]);

  /**
   * Acknowledge an alert by ID.
   * Calls POST /api/v1/alerts/<id>/acknowledge and updates local state.
   * @param {string|number} alertId
   */
  const acknowledge = useCallback(async (alertId) => {
    // Prefer active alert canonical ID to avoid legacy id vs alert_id mismatch.
    const canonicalAlertId = resolveAlertId(activeAlert) || resolveAlertId(alertId);

    if (!canonicalAlertId) {
      console.error('[AlertContext] Missing canonical alert_id for acknowledge.');
      setActiveAlert(null);
      setUnacknowledgedCount((c) => Math.max(0, c - 1));
      return;
    }

    setAcknowledgeError(null);
    setAcknowledgingAlertId(canonicalAlertId);

    try {
      await api.post(`/api/v1/alerts/${canonicalAlertId}/acknowledge`);
      setActiveAlert((prev) => {
        const prevId = resolveAlertId(prev);
        if (!prevId || prevId === canonicalAlertId) return null;
        return prev;
      });
      setUnacknowledgedCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('[AlertContext] Acknowledge failed:', error.message);
      setAcknowledgeError(
        error.response?.data?.error || error.response?.data?.message || 'Acknowledge failed.'
      );
    } finally {
      setAcknowledgingAlertId(null);
    }
  }, [activeAlert]);

  /**
   * Dismiss the active alert overlay without calling the API.
   * Used when the alert has already been acknowledged externally.
   */
  const dismissActive = useCallback(() => {
    setActiveAlert(null);
  }, []);

  const value = useMemo(() => ({
    activeAlert,
    alertHistory,
    unacknowledgedCount,
    acknowledgingAlertId,
    acknowledgeError,
    acknowledge,
    dismissActive,
    detectionEvents,
    cameraStatuses,
    systemStatus,
    socketConnected,
    socketMeta,
    triageFilters,
    setTriageFilters,
    resetTriageFilters,
    refreshSystemStatus,
  }), [
    activeAlert,
    alertHistory,
    unacknowledgedCount,
    acknowledgingAlertId,
    acknowledgeError,
    acknowledge,
    dismissActive,
    detectionEvents,
    cameraStatuses,
    systemStatus,
    socketConnected,
    socketMeta,
    triageFilters,
    setTriageFilters,
    resetTriageFilters,
    refreshSystemStatus,
  ]);

  return (
    <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
  );
}

/**
 * Hook to access alert context.
 * @returns {{ activeAlert, alertHistory, unacknowledgedCount, acknowledge, dismissActive }}
 */
export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlerts must be used inside <AlertProvider>');
  }
  return ctx;
}

export default AlertContext;
