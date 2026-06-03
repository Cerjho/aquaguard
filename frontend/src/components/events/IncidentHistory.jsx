import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import api from '../../hooks/useApi';
import PremiumLoader from '../layout/PremiumLoader.jsx';
import { mapEventClassLabel, mapEventConfidence, mapEventTimestamp } from '../../utils/eventMappers';

const PAGE_SIZE = 10;

function IncidentHistory({ headerTabs }) {
  const prefersReducedMotion = useReducedMotion();
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const fetchEvents = useCallback(async (pageNum) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (events.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const res = await api.get('/api/v1/events', {
        params: {
          page: pageNum,
          limit: PAGE_SIZE,
        },
      });
      const data = res?.data?.data ?? res?.data;
      if (requestId !== requestIdRef.current) return;
      
      if (Array.isArray(data)) {
        setEvents(data);
        setTotal(data.length); 
      } else {
        setEvents(data.events || []);
        setTotal(data.total || data.events?.length || 0);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError('Failed to load detection events.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [events.length]);

  useEffect(() => {
    fetchEvents(page);
  }, [fetchEvents, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return <PremiumLoader />;
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-6 text-center">
        <p className="text-rose-400">{error}</p>
        <button
          onClick={() => fetchEvents(page)}
          className="mt-2 px-4 py-1.5 text-sm rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      className="relative rounded-xl border border-slate-800 bg-[#0a0f18] shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col"
    >
      <div className="relative flex items-center justify-between px-6 border-b border-slate-800 bg-[#0a0f18] rounded-t-xl">
        {headerTabs ? headerTabs : (
          <div className="py-4">
            <p className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">Detection Events</p>
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Master view of historical detections</p>
          </div>
        )}
      </div>

      {refreshing && (
        <div className="px-6 py-2 border-b border-slate-800 bg-slate-900 text-[10px] font-mono tracking-widest text-cyan-400 uppercase">
          Refreshing events…
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {events.length === 0 ? (
          <div className="text-center py-10 text-xs font-mono tracking-widest text-slate-500 uppercase">No events found.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {events.map((ev, idx) => {
              const confidence = mapEventConfidence(ev);
              const eventTime = mapEventTimestamp(ev);
              const key = ev.id || ev.event_id || `${eventTime}-${idx}`;
              return (
                <div key={key} className="w-full text-left px-5 py-4 hover:bg-slate-900/50 transition-all flex items-start gap-4">
                  <span
                    className={`mt-1.5 shrink-0 w-2 h-2 rounded shadow-[0_0_8px_rgba(0,0,0,0.8)] ${
                      ev.alert_triggered ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse' : 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                    }`}
                    title={ev.alert_triggered ? 'Alert triggered' : 'Detection only'}
                  />
                  <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Event Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase truncate">
                          {mapEventClassLabel(ev)}
                        </p>
                        {ev.alert_triggered && (
                          <span className="inline-flex items-center rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest text-rose-400 border border-rose-500/30">
                            ALERT
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 font-mono tracking-widest uppercase">
                        {new Date(eventTime).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', second: '2-digit'
                        })}
                      </p>
                    </div>

                    {/* Zone & Confidence */}
                    <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                      <div className="hidden sm:flex flex-col items-end">
                        <p className="text-[9px] uppercase tracking-[0.2em] font-mono font-bold text-slate-500 mb-0.5">Zone</p>
                        <span className="inline-flex items-center rounded bg-slate-900 px-2 py-1 text-[10px] font-mono font-bold tracking-wider text-slate-300 border border-slate-800">
                          {ev.zone_name || ev.zone_id || 'UNKNOWN'}
                        </span>
                      </div>
                      <div className="hidden sm:flex flex-col items-end">
                        <p className="text-[9px] uppercase tracking-[0.2em] font-mono font-bold text-slate-500 mb-0.5">Confidence</p>
                        <p className="text-sm font-bold text-cyan-400 font-mono drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                          {confidence != null ? `${(confidence * 100).toFixed(1)}%` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0a0f18] flex items-center justify-between text-xs font-mono font-bold tracking-widest text-slate-500 uppercase rounded-b-xl">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2 rounded border border-slate-700 hover:bg-slate-800 hover:text-slate-200 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded border border-slate-700 hover:bg-slate-800 hover:text-slate-200 text-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
}

export default IncidentHistory;
