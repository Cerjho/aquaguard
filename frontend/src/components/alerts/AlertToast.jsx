/**
 * AquaGuard — AlertToast component
 *
 * Global real-time alert toast that slides in from the top-right when
 * a drowning alert fires. Dramatic red glow for expo demo impact.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAlertState } from '../../context/AlertContext.jsx';
import { formatDateTime } from '../../utils/dateFormat';

const AUTO_DISMISS_MS = 12000;

function AlertToast() {
  const navigate = useNavigate();
  const { activeAlerts } = useAlertState();
  const [visibleAlert, setVisibleAlert] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const lastAlertIdRef = useRef(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Watch for new alerts
  useEffect(() => {
    if (!activeAlerts || activeAlerts.length === 0) {
      setVisibleAlert(null);
      setIsDismissed(false);
      return;
    }

    const latest = activeAlerts[0];
    const latestId = latest?.alert_id || latest?.id || `${latest?.zone_id}-${latest?.alerted_at}`;

    if (latestId !== lastAlertIdRef.current) {
      lastAlertIdRef.current = latestId;
      setVisibleAlert(latest);
      setIsDismissed(false);

      // Auto-dismiss
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsDismissed(true);
      }, AUTO_DISMISS_MS);
    }
  }, [activeAlerts]);

  // Cleanup
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const shouldShow = visibleAlert && !isDismissed;
  const confidence = visibleAlert?.confidence ?? visibleAlert?.final_confidence;
  const confidenceLabel = confidence != null
    ? `${(Number(confidence) * 100).toFixed(0)}% confidence`
    : '';
  const alertTime = visibleAlert?.alerted_at || visibleAlert?.triggered_at || visibleAlert?.timestamp;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          role="alert"
          aria-live="assertive"
          className="fixed top-4 right-4 left-4 sm:left-auto sm:w-[420px] z-[60]"
          initial={{ opacity: 0, y: -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <div className="relative overflow-hidden rounded-2xl border-2 border-rose-400/70 bg-white shadow-[0_8px_40px_rgba(244,63,94,0.25)] backdrop-blur-sm">
            {/* Pulsing red glow at top */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-red-500 to-rose-500 animate-pulse" />

            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                {/* Animated warning icon */}
                <motion.div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </motion.div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-rose-700 uppercase tracking-wide">
                    ⚠ Drowning Alert
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
                    {visibleAlert?.zone_name || visibleAlert?.zone_id || 'Unknown Zone'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {confidenceLabel}
                    {confidenceLabel && alertTime ? ' · ' : ''}
                    {alertTime ? formatDateTime(alertTime) : 'Just now'}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  type="button"
                  onClick={dismiss}
                  className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                  aria-label="Dismiss alert"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  navigate('/');
                }}
                className="mt-3 w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-700 hover:shadow-md active:scale-[0.98]"
                style={{ touchAction: 'manipulation' }}
              >
                View Camera Feed
              </button>
            </div>

            {/* Auto-dismiss progress bar */}
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-rose-400/60"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AlertToast;
