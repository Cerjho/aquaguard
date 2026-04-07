/**
 * AquaGuard — Data Cache Context
 *
 * Provides shared data caching across page navigation to enable instant page loads.
 * Data is fetched once and shared across components, with background refresh.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import api from '../hooks/useApi';
import { useAuth } from './AuthContext';

const DataCacheContext = createContext(null);

const CAMERA_REFRESH_INTERVAL_MS = 30000;

export function DataCacheProvider({ children }) {
  const { isAuthenticated } = useAuth();
  
  // Cameras cache
  const [cameras, setCameras] = useState([]);
  const [camerasLoading, setCamerasLoading] = useState(false);
  const [camerasError, setCamerasError] = useState(null);
  const camerasLoadedRef = useRef(false);
  const cameraRefreshTimerRef = useRef(null);

  // Fetch cameras - only shows loading on first fetch
  const fetchCameras = useCallback(async (options = {}) => {
    const { forceLoading = false, includeInactive = false } = options;
    
    // Only show loading spinner on first load or when forced
    if (!camerasLoadedRef.current || forceLoading) {
      setCamerasLoading(true);
    }
    setCamerasError(null);
    
    try {
      const res = await api.get('/api/v1/cameras', {
        params: includeInactive ? { include_inactive: true } : {},
      });
      const data = Array.isArray(res.data) ? res.data : res.data.cameras || [];
      setCameras(data);
      camerasLoadedRef.current = true;
      return data;
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to load cameras.';
      // Only set error if we have no cached data
      if (!camerasLoadedRef.current) {
        setCamerasError(message);
      }
      return null;
    } finally {
      setCamerasLoading(false);
    }
  }, []);

  // Refresh cameras in background (no loading spinner)
  const refreshCameras = useCallback(() => {
    if (camerasLoadedRef.current) {
      fetchCameras({ forceLoading: false });
    }
  }, [fetchCameras]);

  // Initial fetch when authenticated
  useEffect(() => {
    if (isAuthenticated && !camerasLoadedRef.current) {
      fetchCameras();
    }
  }, [isAuthenticated, fetchCameras]);

  // Background refresh interval
  useEffect(() => {
    if (!isAuthenticated) {
      if (cameraRefreshTimerRef.current) {
        clearInterval(cameraRefreshTimerRef.current);
        cameraRefreshTimerRef.current = null;
      }
      return;
    }

    cameraRefreshTimerRef.current = setInterval(() => {
      if (!document.hidden) {
        refreshCameras();
      }
    }, CAMERA_REFRESH_INTERVAL_MS);

    return () => {
      if (cameraRefreshTimerRef.current) {
        clearInterval(cameraRefreshTimerRef.current);
      }
    };
  }, [isAuthenticated, refreshCameras]);

  // Clear cache on logout
  useEffect(() => {
    if (!isAuthenticated) {
      setCameras([]);
      camerasLoadedRef.current = false;
    }
  }, [isAuthenticated]);

  const value = {
    // Cameras
    cameras,
    camerasLoading,
    camerasError,
    fetchCameras,
    refreshCameras,
    camerasLoaded: camerasLoadedRef.current,
  };

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  );
}

export function useDataCache() {
  const ctx = useContext(DataCacheContext);
  if (!ctx) {
    throw new Error('useDataCache must be used inside <DataCacheProvider>');
  }
  return ctx;
}

export default DataCacheContext;
