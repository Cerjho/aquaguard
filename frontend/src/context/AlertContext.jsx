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
  useRef,
} from 'react';
import useAlertSocket from '../hooks/useAlertSocket';
import api from '../hooks/useApi';
import { useAuth } from './AuthContext.jsx';
import { normalizeServiceStatus } from '../utils/statusHelpers';
import logger from '../utils/logger';
import {
  DEFAULT_TRIAGE_FILTERS,
  DETECTION_EVENT_BATCH_MS,
  MAX_ALERT_HISTORY,
  MAX_DETECTION_EVENTS,
  STATUS_POLL_BASE_INTERVAL_MS,
  STATUS_POLL_HIDDEN_INTERVAL_MS,
} from './alertConfig';
import { normalizeAlertPayload, resolveAlertId } from './alertUtils';

const AlertContext = createContext(null);
const AlertStateContext = createContext(null);
const SystemStateContext = createContext(null);
const FilterStateContext = createContext(null);
const SocketStateContext = createContext(null);

export function AlertProvider({ children }) {
  const { isAuthenticated, initializingSession } = useAuth();
  const [activeAlert, setActiveAlert] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const alertTimeoutsRef = useRef({});

  const [detectionEvents, setDetectionEvents] = useState([]);
  const [cameraStatuses, setCameraStatuses] = useState({});
  const [cameraHealthMap, setCameraHealthMap] = useState({});
  const [systemStatus, setSystemStatus] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketMeta, setSocketMeta] = useState(null);
  const [apiStatus, setApiStatus] = useState({
    connected: null,
    failures: 0,
    lastSuccessAt: null,
    lastCheckedAt: null,
  });

  const [triageFilters, setTriageFiltersState] = useState(DEFAULT_TRIAGE_FILTERS);
  const realtimeEnabled = isAuthenticated && !initializingSession;
  const statusPollTimerRef = useRef(null);
  const statusPollFailuresRef = useRef(0);
  const detectionBufferRef = useRef([]);
  const detectionFlushTimerRef = useRef(null);

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
    setActiveAlerts((prev) => {
      const alertId = resolveAlertId(normalizedPayload);
      if (!alertId) return [normalizedPayload, ...prev];
      const filtered = prev.filter((item) => resolveAlertId(item) !== alertId);
      return [normalizedPayload, ...filtered];
    });
    setAlertHistory((prev) => [normalizedPayload, ...prev].slice(0, MAX_ALERT_HISTORY));
    
    // Auto-expire the alert border after 5 seconds of no new detection
    const zoneId = normalizedPayload.zone_id;
    if (zoneId) {
      if (alertTimeoutsRef.current[zoneId]) {
        clearTimeout(alertTimeoutsRef.current[zoneId]);
      }
      alertTimeoutsRef.current[zoneId] = setTimeout(() => {
        setActiveAlerts((prev) => prev.filter(a => a.zone_id !== zoneId));
        setActiveAlert((curr) => curr?.zone_id === zoneId ? null : curr);
        delete alertTimeoutsRef.current[zoneId];
      }, 5000);
    }
  }, []);

  const onDetectionEvent = useCallback((payload) => {
    if (!payload) return;
    detectionBufferRef.current.push(payload);
    if (detectionFlushTimerRef.current) return;
    detectionFlushTimerRef.current = setTimeout(() => {
      const buffered = detectionBufferRef.current;
      detectionBufferRef.current = [];
      detectionFlushTimerRef.current = null;
      if (buffered.length === 0) return;

      setDetectionEvents((prev) => {
        const merged = [...buffered.reverse(), ...prev];
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
    }, DETECTION_EVENT_BATCH_MS);
  }, []);

  const onCameraStatus = useCallback((payload) => {
    const incoming = Array.isArray(payload) ? payload : [payload];
    setCameraStatuses((prev) => {
      const next = { ...prev };
      let changed = false;
      incoming.forEach((camera) => {
        if (!camera || !camera.zone_id) return;
        const normalized = {
          zone_id: camera.zone_id,
          zone_name: camera.zone_name || camera.zone_id,
          status: normalizeServiceStatus(camera.status ?? camera.is_active),
          snapshot_age_seconds:
            typeof camera.snapshot_age_seconds === 'number' ? camera.snapshot_age_seconds : null,
          last_snapshot_at: camera.last_snapshot_at || null,
        };
        const existing = prev[camera.zone_id];
        if (
          !existing
          || existing.zone_name !== normalized.zone_name
          || existing.status !== normalized.status
          || existing.snapshot_age_seconds !== normalized.snapshot_age_seconds
          || existing.last_snapshot_at !== normalized.last_snapshot_at
        ) {
          changed = true;
          next[camera.zone_id] = normalized;
        }
      });
      return changed ? next : prev;
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
    enabled: realtimeEnabled,
    onAlert,
    onDetectionEvent,
    onCameraStatus,
    onSystemStatus,
    onConnectionChange,
  });

  const refreshSystemStatus = useCallback(async () => {
    if (!realtimeEnabled) {
      setApiStatus((prev) => ({
        ...prev,
        connected: null,
        lastCheckedAt: new Date().toISOString(),
      }));
      return false;
    }

    try {
      const response = await api.get('/api/v1/system/status');
      const payload = response?.data?.data ?? response?.data ?? {};
      setSystemStatus(payload);
      if (Array.isArray(payload.camera_status)) {
        onCameraStatus(payload.camera_status);
      }
      statusPollFailuresRef.current = 0;
      const now = new Date().toISOString();
      setApiStatus((prev) => ({
        ...prev,
        connected: true,
        failures: 0,
        lastSuccessAt: now,
        lastCheckedAt: now,
      }));
      return true;
    } catch {
      statusPollFailuresRef.current += 1;
      setApiStatus((prev) => ({
        ...prev,
        connected: false,
        failures: statusPollFailuresRef.current,
        lastCheckedAt: new Date().toISOString(),
      }));
      return false;
    }
  }, [onCameraStatus, realtimeEnabled]);

  const refreshCameraHealth = useCallback(async () => {
    if (!realtimeEnabled) {
      setCameraHealthMap({});
      return;
    }
    try {
      const response = await api.get('/api/v1/cameras/health');
      const payload = response?.data?.data ?? response?.data;
      const healthRows = Array.isArray(payload?.cameras) ? payload.cameras : [];
      const next = {};
      healthRows.forEach((row) => {
        if (!row || !row.zone_id) return;
        next[row.zone_id] = {
          status: normalizeServiceStatus(row.status),
          fps_actual: typeof row.fps_actual === 'number' ? row.fps_actual : null,
          fps_target: typeof row.fps_target === 'number' ? row.fps_target : null,
          corruption_rate: typeof row.corruption_rate === 'number' ? row.corruption_rate : null,
          reconnect_count: Number.isFinite(row.reconnect_count) ? row.reconnect_count : 0,
          latest_frame_at: row.latest_frame_at || null,
          updated_at: row.updated_at || null,
        };
      });
      setCameraHealthMap(next);
    } catch {
      setCameraHealthMap({});
    }
  }, [realtimeEnabled]);

  useEffect(() => {
    let unmounted = false;

    if (!realtimeEnabled) {
      if (statusPollTimerRef.current) clearTimeout(statusPollTimerRef.current);
      return () => {
        unmounted = true;
      };
    }

    const scheduleNextPoll = (delayMs) => {
      if (unmounted) return;
      if (statusPollTimerRef.current) clearTimeout(statusPollTimerRef.current);
      statusPollTimerRef.current = setTimeout(async () => {
        if (document.hidden) {
          scheduleNextPoll(STATUS_POLL_HIDDEN_INTERVAL_MS);
          return;
        }
        await Promise.all([refreshSystemStatus(), refreshCameraHealth()]);
        scheduleNextPoll(STATUS_POLL_BASE_INTERVAL_MS);
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshSystemStatus();
        refreshCameraHealth();
        scheduleNextPoll(STATUS_POLL_BASE_INTERVAL_MS);
      }
    };

    refreshSystemStatus();
    refreshCameraHealth();
    scheduleNextPoll(STATUS_POLL_BASE_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unmounted = true;
      if (statusPollTimerRef.current) clearTimeout(statusPollTimerRef.current);
      if (detectionFlushTimerRef.current) clearTimeout(detectionFlushTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshSystemStatus, refreshCameraHealth, realtimeEnabled]);

  const alertStateValue = useMemo(() => ({
    activeAlert,
    activeAlerts,
    alertHistory,
    detectionEvents,
  }), [
    activeAlert,
    activeAlerts,
    alertHistory,
    detectionEvents,
  ]);

  const systemStateValue = useMemo(() => ({
    cameraStatuses,
    cameraHealthMap,
    systemStatus,
    apiStatus,
    refreshSystemStatus,
    refreshCameraHealth,
  }), [
    cameraStatuses,
    cameraHealthMap,
    systemStatus,
    apiStatus,
    refreshSystemStatus,
    refreshCameraHealth,
  ]);

  const filterStateValue = useMemo(() => ({
    triageFilters,
    setTriageFilters,
    resetTriageFilters,
  }), [triageFilters, setTriageFilters, resetTriageFilters]);

  const socketStateValue = useMemo(() => ({
    socketConnected,
    socketMeta,
  }), [socketConnected, socketMeta]);

  // Keep legacy useAlerts() contract for existing consumers and tests.
  const legacyValue = useMemo(() => ({
    ...alertStateValue,
    ...systemStateValue,
    ...filterStateValue,
    ...socketStateValue,
  }), [
    alertStateValue,
    systemStateValue,
    filterStateValue,
    socketStateValue,
  ]);

  return (
    <AlertContext.Provider value={legacyValue}>
      <AlertStateContext.Provider value={alertStateValue}>
        <SystemStateContext.Provider value={systemStateValue}>
          <FilterStateContext.Provider value={filterStateValue}>
            <SocketStateContext.Provider value={socketStateValue}>
              {children}
            </SocketStateContext.Provider>
          </FilterStateContext.Provider>
        </SystemStateContext.Provider>
      </AlertStateContext.Provider>
    </AlertContext.Provider>
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

export function useAlertState() {
  const ctx = useContext(AlertStateContext);
  if (!ctx) {
    throw new Error('useAlertState must be used inside <AlertProvider>');
  }
  return ctx;
}

export function useSystemState() {
  const ctx = useContext(SystemStateContext);
  if (!ctx) {
    throw new Error('useSystemState must be used inside <AlertProvider>');
  }
  return ctx;
}

export function useFilterState() {
  const ctx = useContext(FilterStateContext);
  if (!ctx) {
    throw new Error('useFilterState must be used inside <AlertProvider>');
  }
  return ctx;
}

export function useSocketState() {
  const ctx = useContext(SocketStateContext);
  if (!ctx) {
    throw new Error('useSocketState must be used inside <AlertProvider>');
  }
  return ctx;
}

export default AlertContext;
