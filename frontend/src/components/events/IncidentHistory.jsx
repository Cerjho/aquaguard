/**
 * AquaGuard — IncidentHistory component.
 *
 * Paginated table of all detection events from GET /api/v1/events.
 * Columns: time, zone, class, confidence, alert triggered.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';
import { useFilterState } from '../../context/AlertContext.jsx';
import {
  mapEventClassLabel,
  mapEventConfidence,
  mapEventTimestamp,
} from '../../utils/eventMappers';

const PAGE_SIZE = 10;
const INCIDENT_STATUS_VALUES = new Set(['alerted', 'normal', 'unacknowledged', 'acknowledged']);

function IncidentHistory() {
  const prefersReducedMotion = useReducedMotion();
  const { triageFilters, setTriageFilters, resetTriageFilters } = useFilterState();
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [draftFilters, setDraftFilters] = useState(triageFilters || {});
  const requestIdRef = useRef(0);

  const toNumericFilter = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const isValidDateFilter = (value) => {
    if (!value) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
  };

  useEffect(() => {
    setDraftFilters(triageFilters || {});
  }, [triageFilters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = draftFilters || {};
      const current = triageFilters || {};
      const hasChanged = (
        (next.zone_id || '') !== (current.zone_id || '')
        || (next.status || '') !== (current.status || '')
        || (next.min_confidence || '') !== (current.min_confidence || '')
        || (next.from || '') !== (current.from || '')
        || (next.to || '') !== (current.to || '')
      );
      if (hasChanged) {
        setTriageFilters(next);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draftFilters, triageFilters, setTriageFilters]);

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
      const filterState = triageFilters || {};
      const minConfidence = toNumericFilter(filterState.min_confidence);
      const normalizedStatus = INCIDENT_STATUS_VALUES.has(filterState.status)
        ? filterState.status
        : '';
      const res = await api.get('/api/v1/events', {
        params: {
          page: pageNum,
          limit: PAGE_SIZE,
          ...(filterState.zone_id ? { zone_id: filterState.zone_id } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
          ...(minConfidence !== null ? { min_confidence: minConfidence } : {}),
          ...(isValidDateFilter(filterState.from) ? { from: filterState.from } : {}),
          ...(isValidDateFilter(filterState.to) ? { to: filterState.to } : {}),
        },
      });
      const data = res.data;
      if (requestId !== requestIdRef.current) return;
      if (Array.isArray(data)) {
        setEvents(data);
        setTotal(data.length);
      } else {
        setEvents(data.events || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(
        err.response?.data?.message
        || err.response?.data?.error
        || 'Failed to load incident history.'
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [triageFilters, events.length]);

  useEffect(() => {
    fetchEvents(page);
  }, [fetchEvents, page]);

  useEffect(() => {
    setPage(1);
  }, [triageFilters]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading incident history">
        <div className="glass-subtle rounded-2xl border border-slate-200 p-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="skeleton h-10" />
            ))}
          </div>
        </div>
        <div className="glass-subtle rounded-2xl border border-slate-200 p-4">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="skeleton h-12" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-6 text-center" role="alert">
        <p className="text-rose-300">{error}</p>
        <button
          onClick={() => fetchEvents(page)}
          className="mt-2 btn-danger"
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
      aria-label="Incident history table"
    >
      <div className="mb-3 rounded-2xl border border-slate-200 glass-subtle p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            aria-label="Filter incidents by zone ID"
            value={draftFilters?.zone_id || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, zone_id: e.target.value }))}
            placeholder="Zone ID"
            className="input-field"
          />
          <select
            aria-label="Filter incidents by status"
            value={draftFilters?.status || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="input-field"
          >
            <option value="">All statuses</option>
            <option value="alerted">Alerted</option>
            <option value="normal">Normal</option>
            <option value="unacknowledged">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
          <input
            type="number"
            aria-label="Filter incidents by minimum confidence"
            min="0"
            max="1"
            step="0.01"
            value={draftFilters?.min_confidence || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, min_confidence: e.target.value }))}
            placeholder="Min confidence"
            className="input-field"
          />
          <input
            type="datetime-local"
            aria-label="Filter incidents from datetime"
            value={draftFilters?.from || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, from: e.target.value }))}
            className="input-field"
          />
          <input
            type="datetime-local"
            aria-label="Filter incidents to datetime"
            value={draftFilters?.to || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, to: e.target.value }))}
            className="input-field"
          />
        </div>
        <div className="mt-2 text-right">
          <button
            onClick={() => {
              resetTriageFilters();
              setDraftFilters({
                zone_id: '',
                status: '',
                min_confidence: '',
                from: '',
                to: '',
              });
            }}
            className="px-3 py-1 text-xs rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 focus-ring"
          >
            Reset filters
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 glass-subtle">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Time', 'Zone', 'Class', 'Confidence', 'Alert Triggered'].map((col) => (
                <th
                  key={col}
                   className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">
                  No events recorded.
                </td>
              </tr>
            ) : (
              events.map((ev) => {
                const confidence = mapEventConfidence(ev);
                const eventTime = mapEventTimestamp(ev);
                return (
                  <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {formatDateTime(eventTime)}
                    </td>
                    <td className="px-4 py-3 text-slate-900 font-medium">
                      {ev.zone_name || ev.zone_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">
                      {mapEventClassLabel(ev, '—')}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {confidence != null ? `${(confidence * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {ev.alert_triggered ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                          Yes
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          No
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {refreshing && (
        <p className="mt-2 text-xs text-slate-500">Refreshing incidents…</p>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} of {totalPages} &nbsp;({total} total)
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
