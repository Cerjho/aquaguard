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

let refreshRequest = null;
let logoutInProgress = false;

function isAuthEndpoint(url) {
  if (!url) return false;
  return [AUTH_LOGIN_PATH, AUTH_REFRESH_PATH, AUTH_LOGOUT_PATH, AUTH_ME_PATH]
    .some((path) => String(url).includes(path));
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
    if (url.includes(AUTH_LOGOUT_PATH) || url.includes(AUTH_LOGIN_PATH)) {
      logoutInProgress = false;
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
