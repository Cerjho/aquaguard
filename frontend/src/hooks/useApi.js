/**
 * AquaGuard — Axios instance with automatic JWT injection.
 *
 * ALL HTTP calls in the application must use this instance.
 * Never use raw axios.create() or fetch() with hardcoded URLs (Rule R6-H).
 *
 * Usage:
 *   import api from '../hooks/useApi';
 *   const res = await api.get('/api/v1/cameras');
 */

import axios from 'axios';
import { API_BASE_URL } from '../utils/constants';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
});

const AUTH_LOGIN_PATH = '/api/v1/auth/login';
const AUTH_REFRESH_PATH = '/api/v1/auth/refresh';
const AUTH_LOGOUT_PATH = '/api/v1/auth/logout';
const AUTH_ME_PATH = '/api/v1/auth/me';
const GET_CACHE_TTL_MS = Number(process.env.REACT_APP_GET_CACHE_TTL_MS || 45000);

const getResponseCache = new Map();
const inFlightGetRequests = new Map();

let refreshRequest = null;
let logoutInProgress = false;

function isAuthEndpoint(url) {
  if (!url) return false;
  return [AUTH_LOGIN_PATH, AUTH_REFRESH_PATH, AUTH_LOGOUT_PATH, AUTH_ME_PATH]
    .some((path) => String(url).includes(path));
}

function stableStringify(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${key}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return String(value);
}

function buildGetRequestKey(url, config = {}) {
  const requestUrl = String(url || '');
  const paramsPart = stableStringify(config.params || {});
  const basePart = config.baseURL || api.defaults.baseURL || '';
  return `${basePart}|${requestUrl}|${paramsPart}`;
}

function clearGetRequestCache() {
  getResponseCache.clear();
}

function shouldBypassGetCache(url, config = {}) {
  const requestUrl = String(url || '');
  if (config.skipCache || config.noCache) return true;
  if (isAuthEndpoint(requestUrl)) return true;
  if (requestUrl.includes('/stream-token')) return true;
  if (requestUrl.includes('/webrtc/session-status')) return true;
  return false;
}

function getCachedResponse(cacheKey) {
  const entry = getResponseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    getResponseCache.delete(cacheKey);
    return null;
  }
  return entry.response;
}

function setCachedResponse(cacheKey, response) {
  if (!Number.isFinite(GET_CACHE_TTL_MS) || GET_CACHE_TTL_MS <= 0) return;
  getResponseCache.set(cacheKey, {
    response,
    expiresAt: Date.now() + GET_CACHE_TTL_MS,
  });
}

async function refreshAccessToken() {
  if (logoutInProgress) {
    return Promise.reject(new Error('logout in progress'));
  }

  if (!refreshRequest) {
    refreshRequest = api.post(AUTH_REFRESH_PATH)
      .then((response) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('token-refreshed'));
        }
        return response;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

function getCookieValue(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Attach CSRF token for cookie-authenticated mutating requests
api.interceptors.request.use(
  (config) => {
    const url = String(config.url || '');
    const method = (config.method || 'get').toLowerCase();
    if (method === 'post' && url.includes(AUTH_LOGOUT_PATH)) {
      logoutInProgress = true;
    }

    const isMutating = ['post', 'put', 'patch', 'delete'].includes(method);
    if (isMutating) {
      const csrfCookieName = config.url?.includes('/api/v1/auth/refresh')
        ? 'csrf_refresh_token'
        : 'csrf_access_token';
      const csrfToken = getCookieValue(csrfCookieName);
      if (csrfToken) {
        config.headers['X-CSRF-TOKEN'] = csrfToken;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response error handler — redirect to login only on auth (401) failure
api.interceptors.response.use(
  (response) => {
    const url = String(response?.config?.url || '');
    const method = (response?.config?.method || 'get').toLowerCase();
    if (url.includes(AUTH_LOGOUT_PATH) || url.includes(AUTH_LOGIN_PATH)) {
      logoutInProgress = false;
      clearGetRequestCache();
    }
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      clearGetRequestCache();
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config || {};
    const requestUrl = String(originalRequest.url || '');
    const onLoginRoute = window.location.pathname === '/login';

    if (requestUrl.includes(AUTH_LOGOUT_PATH) || requestUrl.includes(AUTH_LOGIN_PATH)) {
      logoutInProgress = false;
    }

    if (status === 401) {
      const authRequest = isAuthEndpoint(originalRequest.url);
      const alreadyRetried = Boolean(originalRequest._retry);
      const canAttemptRefresh = !authRequest && !alreadyRetried && !logoutInProgress && !onLoginRoute;

      if (canAttemptRefresh) {
        originalRequest._retry = true;
        try {
          await refreshAccessToken();
          return api(originalRequest);
        } catch {
          // Fallback to login redirect when refresh token is missing/expired.
        }
      }

      // Force auth boundary reset so protected pages do not keep firing requests.
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export default api;

const rawGet = api.get.bind(api);

api.get = async (url, config = {}) => {
  if (shouldBypassGetCache(url, config) || !Number.isFinite(GET_CACHE_TTL_MS) || GET_CACHE_TTL_MS <= 0) {
    return rawGet(url, config);
  }

  const cacheKey = buildGetRequestKey(url, config);
  const cachedResponse = getCachedResponse(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  if (inFlightGetRequests.has(cacheKey)) {
    return inFlightGetRequests.get(cacheKey);
  }

  const requestPromise = rawGet(url, config)
    .then((response) => {
      setCachedResponse(cacheKey, response);
      return response;
    })
    .finally(() => {
      inFlightGetRequests.delete(cacheKey);
    });

  inFlightGetRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

api.clearGetCache = clearGetRequestCache;
