import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';
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
      className="relative rounded-3xl border border-[#e7ecef] bg-white shadow-sm flex flex-col"
    >
      <div className="relative flex items-center justify-between px-6 border-b border-[#e7ecef] bg-white rounded-t-3xl">
        {headerTabs ? headerTabs : (
          <div className="py-4">
            <p className="text-sm font-medium text-slate-900">Detection Events</p>
            <p className="text-xs text-slate-500">Master view of historical detections</p>
          </div>
        )}
      </div>

      {refreshing && (
        <div className="px-6 py-2 border-b border-[#e7ecef] bg-slate-50 text-xs text-slate-500">
          Refreshing events…
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {events.length === 0 ? (
          <div className="text-center py-10 text-slate-500">No events found.</div>
        ) : (
          <div className="divide-y divide-[#e7ecef]">
            {events.map((ev, idx) => {
              const confidence = mapEventConfidence(ev);
              const eventTime = mapEventTimestamp(ev);
              const key = ev.id || ev.event_id || `${eventTime}-${idx}`;
              return (
                <div key={key} className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-all flex items-center gap-3">
                  <span
                    className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                      ev.alert_triggered ? 'bg-rose-500 animate-pulse' : 'bg-blue-400'
                    }`}
                    title={ev.alert_triggered ? 'Alert triggered' : 'Detection only'}
                  />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center flex-1">
                    <div className="md:col-span-4">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {mapEventClassLabel(ev)}
                        {ev.alert_triggered && (
                          <span className="ml-2 text-xs text-rose-600 font-bold">⚠ ALERT</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{formatDateTime(eventTime)}</p>
                    </div>
                    <div className="md:col-span-4 text-sm text-slate-700">
                      Zone: {ev.zone_name || ev.zone_id || '—'}
                    </div>
                    <div className="md:col-span-4 text-sm text-slate-700 text-left md:text-right">
                      Confidence: {confidence != null ? `${(confidence * 100).toFixed(1)}%` : '—'}
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
        <div className="px-6 py-4 border-t border-[#e7ecef] bg-slate-50 flex items-center justify-between text-sm text-slate-600 rounded-b-3xl">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
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
