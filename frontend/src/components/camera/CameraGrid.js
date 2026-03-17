/**
 * AquaGuard — CameraGrid component.
 *
 * Fetches all camera zones from GET /api/v1/cameras and renders
 * a responsive grid of CameraCard tiles.
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '../../hooks/useApi';
import CameraCard from './CameraCard';

function CameraGrid() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/cameras');
      // Backend returns { cameras: [...] } or directly an array
      const data = Array.isArray(res.data) ? res.data : res.data.cameras || [];
      setCameras(data);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Failed to load cameras. Is the backend running?'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <svg
            className="animate-spin h-8 w-8 text-sky-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Loading cameras…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchCameras}
          className="mt-3 px-4 py-1.5 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <p className="font-medium">No cameras registered.</p>
        <p className="text-sm mt-1">Add cameras via the backend admin panel.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-700">
          Camera Feeds
          <span className="ml-2 text-xs text-slate-400 font-normal">
            {cameras.length} camera{cameras.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <button
          onClick={fetchCameras}
          className="text-xs text-sky-600 hover:text-sky-800 transition-colors"
          title="Refresh cameras"
        >
          ↺ Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <CameraCard key={camera.zone_id || camera.id} camera={camera} />
        ))}
      </div>
    </div>
  );
}

export default CameraGrid;
