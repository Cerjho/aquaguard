/**
 * AquaGuard — AlertPanel component.
 *
 * Full-screen red overlay shown when activeAlert is non-null.
 * Displays: zone name, timestamp, confidence score, frame snapshot.
 * Plays alert audio on mount.
 * "Acknowledge" button calls AlertContext.acknowledge().
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAlertState } from '../../context/AlertContext';
import { API_BASE_URL } from '../../utils/constants';
import { formatDateTime } from '../../utils/dateFormat';
import logger from '../../utils/logger';

const ALERT_ELAPSED_TICK_MS = 1000;

export function resolveSnapshotUrl(snapshotPath, apiBaseUrl = API_BASE_URL) {
  const rawPath = typeof snapshotPath === 'string' ? snapshotPath.trim() : '';
  if (!rawPath) return null;

  // Already absolute URL (http/https) — use as-is.
  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  const normalizedBase = typeof apiBaseUrl === 'string' ? apiBaseUrl.trim().replace(/\/+$/, '') : '';

  // If API base is missing, keep a sensible app-relative URL.
  if (!normalizedBase) {
    return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  }

  const normalizedPath = rawPath.replace(/^\/+/, '');
  return `${normalizedBase}/${normalizedPath}`;
}

function AlertPanel() {
  const {
    activeAlert,
    activeAlerts,
    acknowledge,
    acknowledgingAlertId,
    acknowledgeError,
    dismissActive,
  } = useAlertState();
  const audioRef = useRef(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // Play alert audio whenever a new alert appears
  useEffect(() => {
    if (activeAlert) {
      try {
        const audio = new Audio('/alert.mp3');
        audio.loop = true;
        audio.volume = 0.8;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            // Autoplay may be blocked by browser policy — log but don't crash
            logger.warn('[AlertPanel] Audio autoplay blocked:', err.message);
          });
        }
        audioRef.current = audio;
      } catch (err) {
        logger.warn('[AlertPanel] Could not play alert audio:', err.message);
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [activeAlert]);

  useEffect(() => {
    if (!activeAlert) return undefined;
    const intervalId = setInterval(() => setNowMs(Date.now()), ALERT_ELAPSED_TICK_MS);
    return () => clearInterval(intervalId);
  }, [activeAlert]);

  const alertsToDisplay = activeAlerts?.length ? activeAlerts : (activeAlert ? [activeAlert] : []);
  const primaryAlert = alertsToDisplay[0] || null;
  const primaryAlertId = primaryAlert?.alert_id || primaryAlert?.id;
  const isAcknowledging = primaryAlertId && acknowledgingAlertId === String(primaryAlertId);

  const elapsedSeconds = useMemo(() => {
    const sourceTs = primaryAlert?.alerted_at || primaryAlert?.timestamp;
    if (!sourceTs) return null;
    const parsed = new Date(sourceTs).getTime();
    if (Number.isNaN(parsed)) return null;
    return Math.max(0, Math.floor((nowMs - parsed) / 1000));
  }, [primaryAlert, nowMs]);

  const elapsedLabel = useMemo(() => {
    if (elapsedSeconds == null) return '—';
    const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const secs = (elapsedSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }, [elapsedSeconds]);

  const handleAcknowledge = useCallback(() => {
    if (isAcknowledging) return;
    acknowledge(primaryAlertId);
  }, [isAcknowledging, acknowledge, primaryAlertId]);

  const handleDismiss = useCallback(() => {
    dismissActive();
  }, [dismissActive]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!activeAlert) return;
      if ((event.key === 'a' || event.key === 'A') && !isAcknowledging) {
        event.preventDefault();
        handleAcknowledge();
      }
      if (event.key === 'Escape' && !isAcknowledging) {
        event.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeAlert, isAcknowledging, handleDismiss, handleAcknowledge]);

  if (!alertsToDisplay.length) return null;

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

      <div className="relative w-full max-w-4xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
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
             <p className="text-red-200 text-sm">
               Immediate action required {alertsToDisplay.length > 1 ? `(${alertsToDisplay.length} cameras)` : ''}
             </p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {alertsToDisplay.map((alertItem) => {
              const confidence = alertItem?.confidence ?? alertItem?.final_confidence ?? null;
              const confidencePercent =
                confidence !== null ? `${(Number(confidence) * 100).toFixed(1)}%` : '—';
              const snapshotUrl = resolveSnapshotUrl(alertItem?.frame_snapshot_path);
              const alertId = alertItem?.alert_id || alertItem?.id;
              const isCardAcknowledging = alertId && acknowledgingAlertId === String(alertId);
              return (
                <div key={String(alertId || alertItem?.timestamp || Math.random())} className="rounded-xl border-2 border-red-200 p-4 bg-red-50">
                  {snapshotUrl && (
                    <div className="mb-3 rounded-lg overflow-hidden border border-red-200">
                      <img
                        src={snapshotUrl}
                        alt="Incident snapshot"
                        className="w-full max-h-40 object-contain bg-slate-900"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <div className="text-sm font-semibold text-red-800 truncate mb-1">
                    {alertItem.zone_name || alertItem.zone_id || '—'}
                  </div>
                  <div className="text-xs text-red-700 mb-1">
                    {formatDateTime(alertItem.alerted_at || alertItem.timestamp)}
                  </div>
                  <div className="text-lg font-extrabold text-red-700 mb-3">{confidencePercent}</div>
                  <button
                    onClick={() => acknowledge(alertItem)}
                    disabled={isCardAcknowledging}
                    className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-bold uppercase tracking-wider"
                  >
                    {isCardAcknowledging ? 'Acknowledging…' : 'Acknowledge'}
                  </button>
                </div>
              );
            })}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Zone</dt>
              <dd className="text-base font-bold text-red-800 truncate">
                {primaryAlert?.zone_name || primaryAlert?.zone_id || '—'}
              </dd>
            </div>

            <div className="bg-red-50 rounded-xl p-4 text-center">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Time</dt>
              <dd className="text-sm font-semibold text-red-800">
                {formatDateTime(primaryAlert?.alerted_at || primaryAlert?.timestamp)}
              </dd>
            </div>

            <div className="bg-red-50 rounded-xl p-4 text-center">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Confidence</dt>
              <dd className="text-2xl font-extrabold text-red-700">
                {(primaryAlert?.confidence ?? primaryAlert?.final_confidence) != null
                  ? `${(Number(primaryAlert?.confidence ?? primaryAlert?.final_confidence) * 100).toFixed(1)}%`
                  : '—'}
              </dd>
            </div>

            <div className="bg-red-50 rounded-xl p-4 text-center sm:col-span-3">
              <dt className="text-xs font-medium text-red-400 uppercase tracking-wider mb-1">Elapsed</dt>
              <dd className="text-xl font-extrabold text-red-700">{elapsedLabel}</dd>
            </div>
          </dl>

          {acknowledgeError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {acknowledgeError}
            </div>
          )}

          {/* Acknowledge button */}
          <button
            onClick={handleAcknowledge}
            disabled={isAcknowledging}
            className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:cursor-not-allowed text-white text-lg font-bold uppercase tracking-widest transition-colors duration-200 shadow-lg"
          >
            {isAcknowledging ? 'Acknowledging…' : '✓ Acknowledge Top Alert (A)'}
          </button>

          <button
            onClick={handleDismiss}
            disabled={isAcknowledging}
            className="mt-2 w-full py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 text-sm font-semibold uppercase tracking-wider transition-colors duration-200"
          >
            Dismiss Overlay (Esc)
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
