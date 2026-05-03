/**
 * AquaGuard — Global constants
 * All URLs are read from environment variables.
 * Never hardcode http://localhost:5000 here or anywhere else (Rule R6-H).
 */

function normalizeUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function shouldUseRuntimeOrigin(envUrl, runtimeOrigin, runtimeHostname) {
  if (!runtimeOrigin) return false;
  if (!envUrl) return true;

  const parsedEnvUrl = parseUrl(envUrl);
  const parsedRuntimeUrl = parseUrl(runtimeOrigin);
  if (!parsedEnvUrl || !parsedRuntimeUrl) return false;

  const envHost = parsedEnvUrl.hostname.toLowerCase();
  const runtimeHost = String(runtimeHostname || parsedRuntimeUrl.hostname || '')
    .toLowerCase();

  // If build-time host and runtime host differ, prefer runtime same-origin.
  if (runtimeHost && envHost && runtimeHost !== envHost) return true;

  if (
    parsedRuntimeUrl.protocol === 'https:' &&
    parsedEnvUrl.protocol === 'http:' &&
    envHost === runtimeHost
  ) {
    return true;
  }

  return false;
}

export function resolveRuntimeAwareUrl(envUrl, runtimeOrigin, runtimeHostname) {
  const normalizedRuntimeOrigin = normalizeUrl(runtimeOrigin);
  const normalizedEnvUrl = normalizeUrl(envUrl);

  if (
    shouldUseRuntimeOrigin(
      normalizedEnvUrl,
      normalizedRuntimeOrigin,
      runtimeHostname
    )
  ) {
    const parsedEnvUrl = parseUrl(normalizedEnvUrl);
    const parsedRuntimeUrl = parseUrl(normalizedRuntimeOrigin);
    
    if (parsedEnvUrl && parsedRuntimeUrl) {
      // Reconstruct URL using runtime hostname but envUrl's port/protocol
      // This ensures mobile phones on 192.168.x.x hit the backend on port 5000, not 3000 in local dev
      let portPart = '';
      if (process.env.NODE_ENV !== 'production') {
        portPart = parsedEnvUrl.port ? `:${parsedEnvUrl.port}` : '';
      }
      return `${parsedRuntimeUrl.protocol}//${parsedRuntimeUrl.hostname}${portPart}`;
    }
    return normalizedRuntimeOrigin;
  }

  return normalizedEnvUrl || normalizedRuntimeOrigin;
}

const RUNTIME_ORIGIN = normalizeUrl(
  typeof window !== 'undefined' ? window.location.origin : ''
);
const RUNTIME_HOSTNAME = typeof window !== 'undefined'
  ? window.location.hostname
  : '';
const ENV_API_BASE_URL = normalizeUrl(process.env.REACT_APP_API_URL || '');
const ENV_WS_URL = normalizeUrl(process.env.REACT_APP_WS_URL || '');

export const API_BASE_URL = resolveRuntimeAwareUrl(
  ENV_API_BASE_URL,
  RUNTIME_ORIGIN,
  RUNTIME_HOSTNAME
);

export const WS_URL = resolveRuntimeAwareUrl(
  ENV_WS_URL,
  RUNTIME_ORIGIN,
  RUNTIME_HOSTNAME
) || API_BASE_URL || RUNTIME_ORIGIN;
export const WEBRTC_ENABLE = (process.env.REACT_APP_WEBRTC_ENABLE || 'true').toLowerCase() !== 'false';
export const WEBRTC_FORCE_RELAY = (process.env.REACT_APP_WEBRTC_FORCE_RELAY || 'false').toLowerCase() === 'true';
export const WEBRTC_STUN_URLS = process.env.REACT_APP_WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302';
export const WEBRTC_TURN_URL = process.env.REACT_APP_WEBRTC_TURN_URL || '';
export const WEBRTC_TURN_USERNAME = process.env.REACT_APP_WEBRTC_TURN_USERNAME || '';
export const WEBRTC_TURN_CREDENTIAL = process.env.REACT_APP_WEBRTC_TURN_CREDENTIAL || '';
export const WEBRTC_ICE_TRANSPORT_POLICY = process.env.REACT_APP_WEBRTC_ICE_TRANSPORT_POLICY || 'all';
export const WEBRTC_NEGOTIATION_TIMEOUT_MS = Number(process.env.REACT_APP_WEBRTC_NEGOTIATION_TIMEOUT_MS || 3000);
export const WEBRTC_STATUS_POLL_MS = Number(process.env.REACT_APP_WEBRTC_STATUS_POLL_MS || 1000);
export const WEBRTC_STATUS_POLL_MAX_MS = Number(process.env.REACT_APP_WEBRTC_STATUS_POLL_MAX_MS || 10000);
export const WEBRTC_STATUS_POLL_429_BACKOFF_FACTOR = Number(
	process.env.REACT_APP_WEBRTC_STATUS_POLL_429_BACKOFF_FACTOR || 2
);
// Faster retry for better UX on network changes and page navigation
export const WEBRTC_RETRY_INTERVAL_MS = Number(process.env.REACT_APP_WEBRTC_RETRY_INTERVAL_MS || 1500);
