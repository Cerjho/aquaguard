/**
 * AquaGuard — WebSocket hook for real-time alert and status events.
 *
 * Connects to Socket.IO server using JWT from localStorage.
 * Calls provided callbacks for each incoming event type.
 * Automatically disconnects on unmount.
 *
 * Usage:
 *   useAlertSocket({
 *     onAlert: (payload) => ...,
 *     onCameraStatus: (payload) => ...,
 *     onSystemStatus: (payload) => ...,
 *   });
 */

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from '../utils/constants';

/**
 * @param {Object} options
 * @param {Function} [options.onAlert]        - Called when alert_event is received
 * @param {Function} [options.onCameraStatus] - Called when camera_status is received
 * @param {Function} [options.onSystemStatus] - Called when system_status is received
 */
function useAlertSocket({ onAlert, onCameraStatus, onSystemStatus } = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');

    // Establish Socket.IO connection with JWT auth
    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.info('[AquaGuard WS] Connected — socket id:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.warn('[AquaGuard WS] Connection error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.info('[AquaGuard WS] Disconnected:', reason);
    });

    if (typeof onAlert === 'function') {
      socket.on('alert_event', (payload) => {
        console.info('[AquaGuard WS] alert_event received:', payload);
        onAlert(payload);
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

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // Callbacks are intentionally excluded from deps to avoid reconnect on every render.
    // Consumers should memoize callbacks with useCallback if they need stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return socketRef;
}

export default useAlertSocket;
