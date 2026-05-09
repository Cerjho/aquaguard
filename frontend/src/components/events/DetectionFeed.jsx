/**
 * AquaGuard — DetectionFeed component (Ocean Theme)
 *
 * Live scrolling log of the most recent detection events.
 * Features glassmorphism styling and animated entries.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import api from '../../hooks/useApi';
import { formatDateTime, timeAgo } from '../../utils/dateFormat';
import { useAlertState, useSocketState } from '../../context/AlertContext.jsx';
import {
  mapEventClassLabel,
  mapEventConfidence,
  mapEventTimestamp,
} from '../../utils/eventMappers';

const POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 30000;
const MAX_DISPLAY = 20;
const MAX_BACKOFF_MS = 60000;

function DetectionFeed({ headerTabs }) {
  const navigate = useNavigate();
  const { detectionEvents } = useAlertState();
  const { socketConnected } = useSocketState();
  const [polledEvents, setPolledEvents] = useState([]);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const failureCountRef = useRef(0);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/events', {
        params: { limit: MAX_DISPLAY, page: 1 },
      });
      const payload = res?.data?.data ?? res?.data;
      const data = Array.isArray(payload) ? payload : payload?.events || [];
      setPolledEvents(data);
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
    if (socketConnected) {
      // Fetch once to ensure we have baseline history, then rely on socket
      fetchLatest();
      return undefined;
    }

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
  const isDashboard = !headerTabs;
  const displayLimit = isDashboard ? 5 : MAX_DISPLAY;
  const allEvents = hasRealtimeEvents ? detectionEvents : polledEvents;
  const events = allEvents.slice(0, displayLimit);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0a0f18] shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col">
      <div className="px-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        {headerTabs ? headerTabs : (
          <div className="flex items-center gap-2 py-2.5">
            <div className="inline-flex h-6 w-6 items-center justify-center rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300">Live Feed</h3>
          </div>
        )}
      </div>

      {error && (
        <p className="px-3 py-1.5 text-[11px] font-mono text-rose-400 bg-rose-950/50 border-b border-rose-900/50">{error}</p>
      )}

      <ul className={`divide-y divide-slate-800/50 ${isDashboard ? '' : 'max-h-80 overflow-y-auto'}`}>
        {events.length === 0 && !error ? (
          <li className="px-4 py-6 text-center">
            <div className="relative mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50">
              <span className="absolute inset-0 rounded-lg border border-slate-700/50" />
              <svg className="relative z-10 h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">System idle</p>
          </li>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((ev, idx) => {
              const confidence = mapEventConfidence(ev);
              const eventTime = mapEventTimestamp(ev);
              return (
                <motion.li
                  key={ev.event_id || ev.id || `${eventTime}-${idx}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className={`flex items-start gap-3 px-3 py-2 text-sm border-l-2 ${
                    ev.alert_triggered ? 'bg-rose-950/30 border-rose-500 hover:bg-rose-900/40' : 'border-transparent hover:bg-slate-900/50'
                  }`}
                >
                  <span
                      className={`mt-1.5 shrink-0 w-2 h-2 rounded-sm ${
                        ev.alert_triggered ? 'bg-rose-500 animate-pulse' : 'bg-cyan-500'
                      }`}
                    title={ev.alert_triggered ? 'Alert triggered' : 'Detection only'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-mono text-[13px] truncate ${ev.alert_triggered ? 'text-rose-400 font-bold' : 'text-slate-300'}`}>
                      {mapEventClassLabel(ev).toUpperCase()}
                      {ev.alert_triggered && (
                          <span className="ml-2 text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded uppercase tracking-widest">Alert</span>
                      )}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                      {ev.zone_name || ev.zone_id || 'UNKNOWN_ZONE'} 
                      {confidence != null ? ` · ${(confidence * 100).toFixed(0)}% CONF` : ''}
                    </p>
                  </div>
                  <time className="shrink-0 text-[11px] text-slate-500 whitespace-nowrap font-mono mt-0.5" title={formatDateTime(eventTime)}>
                    {timeAgo(eventTime)}
                  </time>
                </motion.li>
              );
            })}
          </AnimatePresence>
        )}
      </ul>
      {isDashboard && allEvents.length > 5 && (
        <div className="border-t border-slate-800 p-1.5 bg-slate-900/80">
          <button 
            onClick={() => navigate('/incidents', { state: { activeTab: 'events' } })}
            className="w-full py-1.5 text-[11px] uppercase tracking-widest font-semibold text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded transition-colors"
          >
            View Full Log
          </button>
        </div>
      )}
    </div>
  );
}

export default DetectionFeed;
