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
import logger from '../../utils/logger';

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
  } = useAlertState();
  const audioRef = useRef(null);
  const [isDismissed, setIsDismissed] = useState(false);

  const alertsToDisplay = useMemo(
    () => (activeAlerts?.length ? activeAlerts : (activeAlert ? [activeAlert] : [])),
    [activeAlerts, activeAlert]
  );
  const hasActiveAlerts = alertsToDisplay.length > 0;

  // Keep alarm active while any alerts are unacknowledged.
  useEffect(() => {
    if (hasActiveAlerts) {
      try {
        if (!audioRef.current) {
          const audio = new Audio('/alert.mp3');
          audio.loop = true;
          audio.volume = 0.8;
          audioRef.current = audio;
        }

        const playPromise = audioRef.current.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            logger.warn('[AlertPanel] Audio autoplay blocked:', err.message);
          });
        }
      } catch (err) {
        logger.warn('[AlertPanel] Could not play alert audio:', err.message);
      }
      return undefined;
    }

    if (audioRef.current) {
      if (typeof audioRef.current.pause === 'function') {
        audioRef.current.pause();
      }
      if (typeof audioRef.current.currentTime === 'number') {
        audioRef.current.currentTime = 0;
      }
    }
    return undefined;
  }, [hasActiveAlerts]);

  useEffect(() => () => {
    if (audioRef.current) {
      if (typeof audioRef.current.pause === 'function') {
        audioRef.current.pause();
      }
      audioRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!hasActiveAlerts) {
      setIsDismissed(false);
    }
  }, [hasActiveAlerts]);

  const oldestAlert = useMemo(
    () => (alertsToDisplay.length > 0 ? alertsToDisplay[alertsToDisplay.length - 1] : null),
    [alertsToDisplay]
  );
  const oldestAlertId = oldestAlert?.alert_id || oldestAlert?.id;
  const isAcknowledging = oldestAlertId && acknowledgingAlertId === String(oldestAlertId);

  const activeZones = useMemo(() => {
    const unique = [];
    const seen = new Set();
    alertsToDisplay.forEach((item) => {
      const zoneId = item?.zone_id;
      if (!zoneId || seen.has(zoneId)) return;
      seen.add(zoneId);
      unique.push({ zoneId, zoneName: item?.zone_name || zoneId });
    });
    return unique;
  }, [alertsToDisplay]);

  const handleAcknowledge = useCallback(() => {
    if (isAcknowledging) return;
    acknowledge(oldestAlertId);
  }, [isAcknowledging, acknowledge, oldestAlertId]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!hasActiveAlerts) return;
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
  }, [hasActiveAlerts, isAcknowledging, handleDismiss, handleAcknowledge]);

  if (!hasActiveAlerts || isDismissed) return null;

  const scrollToZone = (zoneId) => {
    const card = document.getElementById(`camera-card-${zoneId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div
      role="status"
      aria-live="assertive"
      aria-label="Active drowning alerts"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[min(960px,95vw)]"
    >
      <div className="rounded-xl border border-red-300 bg-red-600/95 text-white shadow-lg backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-extrabold tracking-wide uppercase text-sm">
              ⚠ {alertsToDisplay.length} active alert{alertsToDisplay.length !== 1 ? 's' : ''}
            </p>
            <p className="text-red-100 text-sm truncate">
              {activeZones.map((zone) => zone.zoneName).join(', ')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeZones.map((zone) => (
              <button
                key={zone.zoneId}
                type="button"
                onClick={() => scrollToZone(zone.zoneId)}
                className="rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-1 text-xs font-semibold"
              >
                {zone.zoneName}
              </button>
            ))}
            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              className="rounded-md bg-white text-red-700 hover:bg-red-100 disabled:bg-red-100/70 disabled:text-red-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
            >
              {isAcknowledging ? 'Acknowledging…' : 'Acknowledge Oldest (A)'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-md border border-white/50 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
            >
              Dismiss (Esc)
            </button>
          </div>
        </div>
        {acknowledgeError && (
          <div className="border-t border-red-300/60 bg-red-700/70 px-4 py-2 text-xs text-red-100">
            {acknowledgeError}
          </div>
        )}
      </div>
    </div>
  );
}

export default AlertPanel;
