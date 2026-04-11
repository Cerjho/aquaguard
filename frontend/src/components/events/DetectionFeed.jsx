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

function DetectionFeed() {
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
    <div className="glass-subtle overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-800">Live Detection Feed</h3>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
            socketConnected && !isStale 
              ? 'text-emerald-600 bg-emerald-100' 
              : 'text-amber-700 bg-amber-100'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              socketConnected && !isStale
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-amber-400'
            }`}
          />
          {socketConnected ? (isStale ? 'Stale' : 'Live') : 'Polling'}
        </span>
      </div>

      {error && (
        <p className="px-4 py-2 text-xs text-rose-700 bg-rose-100 border-b border-rose-200">{error}</p>
      )}

      <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {events.length === 0 && !error ? (
          <li className="px-4 py-8 text-center">
            <div className="w-12 h-12 rounded-lg bg-slate-800/50 mx-auto flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="text-slate-400 text-sm">No detection events yet</p>
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
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-sm ${
                    ev.alert_triggered ? 'bg-rose-50' : ''
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
