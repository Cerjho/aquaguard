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

import { useEffect, useRef, useCallback } from 'react';
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
  const isDisconnectingRef = useRef(false);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      isDisconnectingRef.current = true;
      // Disable reconnection before disconnecting to prevent reconnection attempts
      socketRef.current.io.opts.reconnection = false;
      // Close the underlying engine to prevent WebSocket frame errors
      if (socketRef.current.io?.engine) {
        socketRef.current.io.engine.close();
      }
      socketRef.current.disconnect();
      socketRef.current = null;
      // Reset after a short delay
      setTimeout(() => {
        isDisconnectingRef.current = false;
      }, 100);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Disconnect existing socket when disabled
      if (socketRef.current) {
        disconnectSocket();
      }
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
    // Use polling-only transport since backend uses async_mode='threading' which
    // doesn't support native WebSocket upgrade (causes "Invalid frame header" errors).
    const wsUrl = WS_URL;
    logger.info('[AquaGuard WS] Connecting to:', wsUrl);
    
    const socket = io(wsUrl, {
      transports: ['polling'],       // Polling only - threading mode doesn't support websocket
      upgrade: false,                // Don't attempt to upgrade to websocket
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,  // Keep reconnecting indefinitely for life-safety system
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true,                // Force new connection each time
      // Match server ping settings for stability
      pingTimeout: 60000,    // 60s - matches backend ping_timeout
      pingInterval: 25000,   // 25s - matches backend ping_interval
    });
    
    // Debug: Log all socket manager events
    socket.io.on('open', () => logger.info('[AquaGuard WS] Transport opened'));
    socket.io.on('close', (reason) => logger.info('[AquaGuard WS] Transport closed:', reason));
    socket.io.on('packet', (packet) => logger.debug('[AquaGuard WS] Packet:', packet.type));
    socket.io.on('error', (err) => logger.error('[AquaGuard WS] Manager error:', err));

    socketRef.current = socket;

    socket.on('connect', () => {
      logger.info('[AquaGuard WS] Connected - socket id:', socket.id);
      if (typeof onConnectionChange === 'function') {
        onConnectionChange(true, { at: new Date().toISOString(), socketId: socket.id });
      }
    });

    socket.on('connect_error', (err) => {
      // Suppress error logging during intentional disconnect
      if (isDisconnectingRef.current) return;
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
      // Suppress logging during intentional disconnect
      if (!isDisconnectingRef.current) {
        logger.info('[AquaGuard WS] Disconnected:', reason);
      }
      if (typeof onConnectionChange === 'function') {
        onConnectionChange(false, {
          at: new Date().toISOString(),
          reason,
          type: 'disconnect',
        });
      }
    });

    // Handle transport errors gracefully
    socket.io.on('error', () => {
      // Suppress transport errors during disconnect - these are expected
      // when the server invalidates the session before websocket closes
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
      if (!socketRef.current || isDisconnectingRef.current) return;
      // Force a reconnect so the Socket.IO handshake uses the latest cookies.
      socketRef.current.disconnect();
      socketRef.current.connect();
    };

    const handleLogout = () => {
      disconnectSocket();
    };

    window.addEventListener('token-refreshed', handleTokenRefresh);
    window.addEventListener('user-logout', handleLogout);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('token-refreshed', handleTokenRefresh);
      window.removeEventListener('user-logout', handleLogout);
      disconnectSocket();
    };
    // Callbacks are intentionally excluded from deps to avoid reconnect on every render.
    // Consumers should memoize callbacks with useCallback if they need stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, disconnectSocket]);

  return { socketRef, disconnectSocket };
}

export default useAlertSocket;
