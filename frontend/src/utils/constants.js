/**
 * AquaGuard — Global constants
 * All URLs are read from environment variables.
 * Never hardcode http://localhost:5000 here or anywhere else (Rule R6-H).
 */

export const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const RUNTIME_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
export const WS_URL = process.env.REACT_APP_WS_URL || API_BASE_URL || RUNTIME_ORIGIN;
export const WEBRTC_ENABLE = (process.env.REACT_APP_WEBRTC_ENABLE || 'true').toLowerCase() !== 'false';
export const WEBRTC_FORCE_RELAY = (process.env.REACT_APP_WEBRTC_FORCE_RELAY || 'false').toLowerCase() === 'true';
export const WEBRTC_STUN_URLS = process.env.REACT_APP_WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302';
export const WEBRTC_TURN_URL = process.env.REACT_APP_WEBRTC_TURN_URL || '';
export const WEBRTC_TURN_USERNAME = process.env.REACT_APP_WEBRTC_TURN_USERNAME || '';
export const WEBRTC_TURN_CREDENTIAL = process.env.REACT_APP_WEBRTC_TURN_CREDENTIAL || '';
export const WEBRTC_ICE_TRANSPORT_POLICY = process.env.REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY || 'all';
export const WEBRTC_NEGOTIATION_TIMEOUT_MS = Number(process.env.REACT_APP_WEBRTC_NEGOTIATION_TIMEOUT_MS || 4000);
export const WEBRTC_STATUS_POLL_MS = Number(process.env.REACT_APP_WEBRTC_STATUS_POLL_MS || 1500);
export const WEBRTC_RETRY_INTERVAL_MS = Number(process.env.REACT_APP_WEBRTC_RETRY_INTERVAL_MS || 12000);
