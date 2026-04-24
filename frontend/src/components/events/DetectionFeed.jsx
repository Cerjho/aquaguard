/**
 * AquaGuard — DetectionFeed component (Ocean Theme)
 *
 * Live scrolling log of the most recent detection events.
 * Features glassmorphism styling and animated entries.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';
import { useAlertState, useSocketState } from '../../context/AlertContext.jsx';
import {
  mapEventClassLabel,
  mapEventConfidence,
  mapEventTimestamp,
} from '../../utils/eventMappers';

const POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 30000;
const MAX_DISPLAY = 20;
const STALE_AFTER_MS = 15000;
const MAX_BACKOFF_MS = 60000;

function DetectionFeed({ headerTabs }) {
  const { detectionEvents } = useAlertState();
  const { socketConnected } = useSocketState();
  const [polledEvents, setPolledEvents] = useState([]);
  const [error, setError] = useState(null);
  const [lastPollAt, setLastPollAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const intervalRef = useRef(null);
  const failureCountRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/events', {
        params: { limit: MAX_DISPLAY, page: 1 },
      });
      const data = Array.isArray(res.data) ? res.data : res.data.events || [];
      setPolledEvents(data);
      setLastPollAt(Date.now());
      setError(null);
      failureCountRef.current = 0;
      return true;
    } catch (err) {
      setError('Could not fetch detection events.');
      failureCountRef.current += 1;
      return false;
    }
  }, []);

  useEffect(() => {
    if (socketConnected) return undefined;

    let cancelled = false;
    const schedule = (delay) => {
      if (cancelled) return;
      if (intervalRef.current) clearTimeout(intervalRef.current);
      intervalRef.current = setTimeout(async () => {
        if (document.hidden) {
          schedule(HIDDEN_POLL_INTERVAL_MS);
          return;
        }
        const ok = await fetchLatest();
        const next = ok
          ? POLL_INTERVAL_MS
          : Math.min(POLL_INTERVAL_MS * (2 ** Math.max(1, failureCountRef.current)), MAX_BACKOFF_MS);
        schedule(next);
      }, delay);
    };

    fetchLatest();
    schedule(POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) {
        fetchLatest();
        schedule(POLL_INTERVAL_MS);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearTimeout(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchLatest, socketConnected]);

  const hasRealtimeEvents = detectionEvents.length > 0;
  const events = hasRealtimeEvents ? detectionEvents.slice(0, MAX_DISPLAY) : polledEvents;
  const isStale = useMemo(() => {
    if (!lastPollAt) return false;
    return nowTick - lastPollAt > STALE_AFTER_MS;
  }, [lastPollAt, nowTick]);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-[0_16px_32px_rgba(15,23,42,0.06)] backdrop-blur-md flex flex-col">
      <div className="px-6 border-b border-slate-200/70 flex items-center justify-between bg-white/80">
        {headerTabs ? headerTabs : (
          <div className="flex items-center gap-2.5 py-3.5">
            <div className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#a3cef1]/40 bg-[#a3cef1]/15 text-[#7fb2db] shadow-sm">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12h4.5L9 5l6 14 1.5-7H21" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">Live Detection Feed</h3>
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 py-2 text-xs text-rose-700 bg-rose-100 border-b border-rose-200">{error}</p>
      )}

      <ul className="divide-y divide-slate-100/80 max-h-80 overflow-y-auto">
        {events.length === 0 && !error ? (
          <li className="px-4 py-8 text-center">
            <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#a3cef1]/45 bg-gradient-to-b from-[#a3cef1]/25 via-white to-[#a3cef1]/10 shadow-sm">
              <span className="absolute inset-0 rounded-2xl border border-white/60" />
              <span className="absolute -inset-1 rounded-2xl border border-[#a3cef1]/25 animate-pulse" />
              <svg className="relative z-10 h-7 w-7 text-[#7fb2db]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M3 12h4.5L9 5l6 14 1.5-7H21" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm font-medium">No detection events yet</p>
          </li>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((ev, idx) => {
              const confidence = mapEventConfidence(ev);
              const eventTime = mapEventTimestamp(ev);
              return (
                <motion.li
                  key={ev.event_id || ev.id || `${eventTime}-${idx}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className={`mx-2 my-1.5 flex items-start gap-3 rounded-2xl px-3 py-3 hover:bg-white hover:shadow-sm transition-all text-sm ${
                    ev.alert_triggered ? 'bg-rose-50/70 border border-rose-100' : 'bg-slate-50/40'
                  }`}
                >
                  <span
                      className={`mt-1 shrink-0 w-2.5 h-2.5 rounded-full ${
                        ev.alert_triggered ? 'bg-rose-500 animate-pulse' : 'bg-blue-400'
                      }`}
                    title={ev.alert_triggered ? 'Alert triggered' : 'Detection only'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">
                      {mapEventClassLabel(ev)}
                      {ev.alert_triggered && (
                          <span className="ml-2 text-xs text-rose-600 font-bold">⚠ ALERT</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {ev.zone_name || ev.zone_id || '—'} · 
                      {confidence != null ? ` ${(confidence * 100).toFixed(0)}%` : ''}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500 whitespace-nowrap font-mono">
                    {formatDateTime(eventTime)}
                  </time>
                </motion.li>
              );
            })}
          </AnimatePresence>
        )}
      </ul>
    </div>
  );
}

export default DetectionFeed;
