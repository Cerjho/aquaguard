/**
 * AquaGuard — AlertPanel component (Ocean Theme)
 *
 * Full-screen alert banner shown when activeAlert is non-null.
 * Features glowing coral effect and ocean-themed styling.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlertState } from '../../context/AlertContext.jsx';
import { API_BASE_URL } from '../../utils/constants';
import logger from '../../utils/logger';

export function resolveSnapshotUrl(snapshotPath, apiBaseUrl = API_BASE_URL) {
  const rawPath = typeof snapshotPath === 'string' ? snapshotPath.trim() : '';
  if (!rawPath) return null;

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  const normalizedBase = typeof apiBaseUrl === 'string' ? apiBaseUrl.trim().replace(/\/+$/, '') : '';

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
    <AnimatePresence>
      {hasActiveAlerts && !isDismissed && (
        <motion.div
          role="status"
          aria-live="assertive"
          aria-label="Active drowning alerts"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[min(960px,95vw)] md:left-[calc(50%+8rem)] md:w-[min(960px,calc(100vw-20rem))] pointer-events-none"
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ 
            opacity: 1, 
            y: 0, 
            scale: 1,
            boxShadow: [
              '0 0 30px rgba(244, 63, 94, 0.4)',
              '0 0 50px rgba(244, 63, 94, 0.6)',
              '0 0 30px rgba(244, 63, 94, 0.4)',
            ]
          }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ 
            duration: 0.3,
            boxShadow: { duration: 2, repeat: Infinity }
          }}
        >
          <div className="rounded-xl border-2 border-rose-500 glass-elevated overflow-hidden bg-gradient-to-r from-rose-950/90 to-rose-900/90 backdrop-blur-xl pointer-events-auto">
            <div className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex items-center gap-3">
                <motion.div
                  className="w-12 h-12 rounded-lg bg-rose-500/20 backdrop-blur-sm flex items-center justify-center border border-rose-500/30"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <svg className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </motion.div>
                <div>
                  <p className="font-bold tracking-wide uppercase text-base text-rose-400">
                    {alertsToDisplay.length} Active Alert{alertsToDisplay.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-slate-200 text-sm truncate">
                    {activeZones.map((zone) => zone.zoneName).join(', ')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeZones.map((zone) => (
                  <motion.button
                    key={zone.zoneId}
                    type="button"
                    onClick={() => scrollToZone(zone.zoneId)}
                    className="rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-semibold text-white border border-white/20 transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    📍 {zone.zoneName}
                  </motion.button>
                ))}
                <motion.button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={isAcknowledging}
                  className="rounded-lg bg-white text-rose-600 hover:bg-slate-50 disabled:bg-white/70 disabled:text-rose-400 px-4 py-2 text-sm font-bold uppercase tracking-wider shadow-lg transition-all"
                  whileHover={!isAcknowledging ? { scale: 1.05 } : {}}
                  whileTap={!isAcknowledging ? { scale: 0.95 } : {}}
                >
                  {isAcknowledging ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Acknowledging…
                    </span>
                  ) : (
                    'Acknowledge (A)'
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-lg border-2 border-white/50 hover:bg-white/10 backdrop-blur-sm px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white transition-all"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Dismiss (Esc)
                </motion.button>
              </div>
            </div>

            {acknowledgeError && (
              <motion.div 
                className="border-t border-white/20 bg-black/30 backdrop-blur-sm px-5 py-3 text-sm text-rose-300"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                ⚠ {acknowledgeError}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AlertPanel;
