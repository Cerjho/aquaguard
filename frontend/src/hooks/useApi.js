/**
 * AquaGuard — Axios instance for cookie-based auth + CSRF headers.
 *
 * ALL HTTP calls in the application must use this instance.
 * Auth is handled by backend-set httpOnly JWT cookies (`withCredentials: true`),
 * and mutating requests include `X-CSRF-TOKEN` from the corresponding CSRF cookie.
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

function getCookieValue(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Attach CSRF token for cookie-authenticated mutating requests
api.interceptors.request.use(
  (config) => {
    const method = (config.method || 'get').toLowerCase();
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

// Global response error handler — redirect to login on auth failure
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Force auth boundary reset so protected pages do not keep firing requests.
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
