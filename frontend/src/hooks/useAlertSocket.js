/**
 * AquaGuard — WebSocket hook for real-time alert and status events.
 *
 * Connects to Socket.IO server using backend-managed auth cookies.
 * Calls provided callbacks for each incoming event type.
 * Automatically disconnects on unmount.
 *
 * Usage:
 *   useAlertSocket({
 *     onAlert: (payload) => ...,
 *     onDetectionEvent: (payload) => ...,
 *     onCameraStatus: (payload) => ...,
 *     onSystemStatus: (payload) => ...,
 *     onConnectionChange: (connected, meta) => ...,
 *   });
 */

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from '../utils/constants';
import logger from '../utils/logger';

/**
 * @param {Object} options
 * @param {Function} [options.onAlert]        - Called when alert_event is received
 * @param {Function} [options.onDetectionEvent] - Called when detection_event is received
 * @param {Function} [options.onCameraStatus] - Called when camera_status is received
 * @param {Function} [options.onSystemStatus] - Called when system_status is received
 * @param {Function} [options.onConnectionChange] - Called on socket connect/disconnect/error
 */
function useAlertSocket({
  enabled = true,
  onAlert,
  onDetectionEvent,
  onCameraStatus,
  onSystemStatus,
  onConnectionChange,
} = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (typeof onConnectionChange === 'function') {
        onConnectionChange(false, {
          at: new Date().toISOString(),
          reason: 'disabled',
          type: 'disabled',
        });
      }
      return () => {};
    }

    // Establish Socket.IO connection with credentialed cookie handshake.
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      logger.info('[AquaGuard WS] Connected - socket id:', socket.id);
      if (typeof onConnectionChange === 'function') {
        onConnectionChange(true, { at: new Date().toISOString(), socketId: socket.id });
      }
    });

    socket.on('connect_error', (err) => {
      logger.warn('[AquaGuard WS] Connection error:', err.message);
      if (typeof onConnectionChange === 'function') {
        onConnectionChange(false, {
          at: new Date().toISOString(),
          reason: err.message,
          type: 'connect_error',
        });
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('[AquaGuard WS] Disconnected:', reason);
      if (typeof onConnectionChange === 'function') {
        onConnectionChange(false, {
          at: new Date().toISOString(),
          reason,
          type: 'disconnect',
        });
      }
    });

    if (typeof onAlert === 'function') {
      socket.on('alert_event', (payload) => {
        logger.info('[AquaGuard WS] alert_event received:', payload);
        onAlert(payload);
      });
    }

    if (typeof onDetectionEvent === 'function') {
      socket.on('detection_event', (payload) => {
        onDetectionEvent(payload);
      });
    }

    if (typeof onCameraStatus === 'function') {
      socket.on('camera_status', (payload) => {
        onCameraStatus(payload);
      });
    }

    if (typeof onSystemStatus === 'function') {
      socket.on('system_status', (payload) => {
        onSystemStatus(payload);
      });
    }

    const handleTokenRefresh = () => {
      if (!socketRef.current) return;
      // Force a reconnect so the Socket.IO handshake uses the latest cookies.
      socketRef.current.disconnect();
      socketRef.current.connect();
    };

    window.addEventListener('token-refreshed', handleTokenRefresh);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('token-refreshed', handleTokenRefresh);
      socket.disconnect();
      socketRef.current = null;
    };
    // Callbacks are intentionally excluded from deps to avoid reconnect on every render.
    // Consumers should memoize callbacks with useCallback if they need stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return socketRef;
}

export default useAlertSocket;
