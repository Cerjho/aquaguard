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
});

// Attach JWT Bearer token to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response error handler — clears invalid tokens
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid — clear storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export default api;
