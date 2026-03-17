/**
 * AquaGuard — AlertPanel component.
 *
 * Full-screen red overlay shown when activeAlert is non-null.
 * Displays: zone name, timestamp, confidence score, frame snapshot.
 * Plays alert audio on mount.
 * "Acknowledge" button calls AlertContext.acknowledge().
 */

import React, { useEffect, useRef } from 'react';
import { useAlerts } from '../../context/AlertContext';
import { API_BASE_URL } from '../../utils/constants';
import { formatDateTime } from '../../utils/dateFormat';

function AlertPanel() {
  const { activeAlert, acknowledge } = useAlerts();
  const audioRef = useRef(null);

  // Play alert audio whenever a new alert appears
  useEffect(() => {
    if (activeAlert) {
      try {
        const audio = new Audio('/alert.mp3');
        audio.loop = false;
        audio.volume = 0.8;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            // Autoplay may be blocked by browser policy — log but don't crash
            console.warn('[AlertPanel] Audio autoplay blocked:', err.message);
          });
        }
        audioRef.current = audio;
      } catch (err) {
        console.warn('[AlertPanel] Could not play alert audio:', err.message);
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [activeAlert]);

  if (!activeAlert) return null;

  const confidence = activeAlert.confidence ?? activeAlert.final_confidence ?? null;
  const confidencePercent =
    confidence !== null ? `${(Number(confidence) * 100).toFixed(1)}%` : '—';

  const snapshotUrl = activeAlert.frame_snapshot_path
    ? `${API_BASE_URL}/${activeAlert.frame_snapshot_path}`
    : null;

  const handleAcknowledge = () => {
    acknowledge(activeAlert.id);
  };

  return (
    /* Full-screen overlay */
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Drowning alert"
      className="fixed inset-0 z-50 flex items-center justify-center bg-red-900/95 backdrop-blur-sm"
    >
      {/* Pulsing border ring */}
      <div className="absolute inset-0 border-8 border-red-500 animate-pulse pointer-events-none rounded-none" />

      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header bar */}
        <div className="bg-red-600 px-6 py-4 flex items-center gap-3">
          {/* Siren icon */}
          <svg
            className="w-8 h-8 text-white animate-bounce"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </svg>
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-wide uppercase">
              ⚠ DROWNING ALERT
            </h2>
            <p className="text-red-200 text-sm">Immediate action required</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Snapshot */}
          {snapshotUrl && (
            <div className="mb-5 rounded-xl overflow-hidden border-4 border-red-300 shadow-lg">
              <img
                src={snapshotUrl}
                alt="Incident snapshot"
                className="w-full max-h-64 object-contain bg-slate-900"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}

          {/* Alert details */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Zone</dt>
              <dd className="text-base font-bold text-red-800 truncate">
                {activeAlert.zone_name || activeAlert.zone_id || '—'}
              </dd>
            </div>

            <div className="bg-red-50 rounded-xl p-4 text-center">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Time</dt>
              <dd className="text-sm font-semibold text-red-800">
                {formatDateTime(activeAlert.alerted_at || activeAlert.timestamp)}
              </dd>
            </div>

            <div className="bg-red-50 rounded-xl p-4 text-center">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Confidence</dt>
              <dd className="text-2xl font-extrabold text-red-700">
                {confidencePercent}
              </dd>
            </div>
          </dl>

          {/* Acknowledge button */}
          <button
            onClick={handleAcknowledge}
            className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-lg font-bold uppercase tracking-widest transition-colors duration-200 shadow-lg"
          >
            ✓ Acknowledge Alert
          </button>

          <p className="text-center text-slate-400 text-xs mt-3">
            Clicking acknowledge confirms you have responded to this incident.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AlertPanel;
