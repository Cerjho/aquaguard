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

export function AlertProvider({ children }) {
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertHistory, setAlertHistory] = useState([]);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  // Keep a stable reference to the callbacks so the socket hook doesn't reconnect
  const onAlert = useCallback((payload) => {
    setActiveAlert(payload);
    setAlertHistory((prev) => [payload, ...prev]);
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
    try {
      await api.post(`/api/v1/alerts/${alertId}/acknowledge`);
    } catch (error) {
      console.error('[AlertContext] Acknowledge failed:', error.message);
      // Still clear the overlay so the operator isn't locked out
    } finally {
      setActiveAlert((prev) => {
        if (prev && prev.id === alertId) return null;
        return prev;
      });
      setUnacknowledgedCount((c) => Math.max(0, c - 1));
    }
  }, []);

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
