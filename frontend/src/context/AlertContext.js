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
} from 'react';
import useAlertSocket from '../hooks/useAlertSocket';
import api from '../hooks/useApi';

const AlertContext = createContext(null);

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
    payload.frame_snapshot_path
    ?? payload.snapshot_path
    ?? payload.snapshot_url
    ?? payload.alert?.frame_snapshot_path
    ?? payload.alert?.snapshot_path
    ?? payload.alert?.snapshot_url
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

  // Keep a stable reference to the callbacks so the socket hook doesn't reconnect
  const onAlert = useCallback((payload) => {
    const normalizedPayload = normalizeAlertPayload(payload);
    setActiveAlert(normalizedPayload);
    setAlertHistory((prev) => [normalizedPayload, ...prev]);
    setUnacknowledgedCount((c) => c + 1);
  }, []);

  const onCameraStatus = useCallback((_payload) => {
    // Camera status is consumed by SystemStatus component directly via its own hook
  }, []);

  const onSystemStatus = useCallback((_payload) => {
    // System status is consumed by SystemStatus component directly via its own hook
  }, []);

  // Connect WebSocket
  useAlertSocket({ onAlert, onCameraStatus, onSystemStatus });

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

    try {
      await api.post(`/api/v1/alerts/${canonicalAlertId}/acknowledge`);
    } catch (error) {
      console.error('[AlertContext] Acknowledge failed:', error.message);
      // Still clear the overlay so the operator isn't locked out
    } finally {
      setActiveAlert((prev) => {
        const prevId = resolveAlertId(prev);
        if (!prevId || prevId === canonicalAlertId) return null;
        return prev;
      });
      setUnacknowledgedCount((c) => Math.max(0, c - 1));
    }
  }, [activeAlert]);

  /**
   * Dismiss the active alert overlay without calling the API.
   * Used when the alert has already been acknowledged externally.
   */
  const dismissActive = useCallback(() => {
    setActiveAlert(null);
  }, []);

  const value = {
    activeAlert,
    alertHistory,
    unacknowledgedCount,
    acknowledge,
    dismissActive,
  };

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
