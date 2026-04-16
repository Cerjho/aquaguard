/**
 * AquaGuard — AlertHistory component.
 *
 * Paginated table of past alerts fetched from GET /api/v1/alerts.
 * Columns: time, zone, confidence, status, acknowledged by.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';
import { useFilterState } from '../../context/AlertContext.jsx';
import { useDataCache } from '../../context/DataCacheContext.jsx';

const PAGE_SIZE = 10;
const ALERT_STATUS_VALUES = new Set(['unacknowledged', 'acknowledged']);
const STATUS_OPTIONS = [
  { value: '', label: 'Pending (All)', dotClass: 'bg-slate-400' },
  { value: 'unacknowledged', label: 'Critical', dotClass: 'bg-rose-500' },
  { value: 'acknowledged', label: 'Reviewed', dotClass: 'bg-blue-500' },
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function formatDateInput(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function StatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selected = STATUS_OPTIONS.find((opt) => opt.value === value) || STATUS_OPTIONS[0];

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#a3cef1] focus:border-[#a3cef1]"
        aria-label="Filter alerts by status"
      >
        <span className="inline-flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${selected.dotClass}`} />
          {selected.label}
        </span>
        <svg className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 right-0 top-11 z-20 bg-white/95 backdrop-blur-xl shadow-lg rounded-2xl border border-slate-100 p-1.5"
          >
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="w-full text-left rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${option.dotClass}`} />
                  {option.label}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CalendarInput({
  value,
  onChange,
  ariaLabel,
  popoverAlign = 'left',
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const parsedValue = value ? new Date(value) : null;
  const initialMonth = parsedValue && !Number.isNaN(parsedValue.getTime()) ? parsedValue : new Date();
  const [cursorDate, setCursorDate] = useState(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const monthEnd = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0);
  const leadingBlankDays = monthStart.getDay();
  const totalDays = monthEnd.getDate();
  const selectedDate = formatDateInput(value);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-left text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#a3cef1] focus:border-[#a3cef1]"
        aria-label={ariaLabel}
      >
        {selectedDate || 'Select date'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`absolute top-11 z-20 w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-slate-100 bg-white p-3 shadow-lg ${
              popoverAlign === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1))}
                className="h-8 w-8 rounded-full hover:bg-slate-50 text-slate-500"
              >
                ‹
              </button>
              <p className="text-sm font-medium text-slate-800">
                {cursorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1))}
                className="h-8 w-8 rounded-full hover:bg-slate-50 text-slate-500"
              >
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="text-center text-xs text-slate-400 py-1">{label}</div>
              ))}
              {Array.from({ length: leadingBlankDays }).map((_, idx) => (
                <div key={`blank-${idx}`} />
              ))}
              {Array.from({ length: totalDays }).map((_, idx) => {
                const day = idx + 1;
                const dateValue = `${cursorDate.getFullYear()}-${String(cursorDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = dateValue === selectedDate;
                return (
                  <button
                    key={dateValue}
                    type="button"
                    onClick={() => {
                      onChange(dateValue);
                      setOpen(false);
                    }}
                    className={`h-9 rounded-xl text-sm transition-colors ${
                      isSelected
                        ? 'bg-[#a3cef1] text-slate-900 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlertHistory() {
  const prefersReducedMotion = useReducedMotion();
  const { triageFilters, setTriageFilters, resetTriageFilters } = useFilterState();
  const { alertHistorySnapshot, setAlertHistorySnapshot } = useDataCache();
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!alertHistorySnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [draftFilters, setDraftFilters] = useState(triageFilters || {});
  const [appliedFilters, setAppliedFilters] = useState(triageFilters || {});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!alertHistorySnapshot) return;
    setAlerts(alertHistorySnapshot.alerts || []);
    setTotal(alertHistorySnapshot.total || 0);
    setLoading(false);
  }, [alertHistorySnapshot]);

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
    setAppliedFilters(triageFilters || {});
  }, [triageFilters]);

  const fetchAlerts = useCallback(async (pageNum) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (alerts.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const filterState = appliedFilters || {};
      const minConfidence = toNumericFilter(filterState.min_confidence);
      const normalizedStatus = ALERT_STATUS_VALUES.has(filterState.status)
        ? filterState.status
        : '';
      const res = await api.get('/api/v1/alerts', {
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
      // Backend may return { alerts: [...], total: N } or directly an array
      if (Array.isArray(data)) {
        setAlerts(data);
        setTotal(data.length);
        setAlertHistorySnapshot({
          alerts: data,
          total: data.length,
          fetchedAt: Date.now(),
        });
      } else {
        const nextAlerts = data.alerts || [];
        const nextTotal = data.total || 0;
        setAlerts(nextAlerts);
        setTotal(nextTotal);
        setAlertHistorySnapshot({
          alerts: nextAlerts,
          total: nextTotal,
          fetchedAt: Date.now(),
        });
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(
        err.response?.data?.message
        || err.response?.data?.error
        || 'Failed to load alert history.'
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [appliedFilters, alerts.length, setAlertHistorySnapshot]);

  useEffect(() => {
    fetchAlerts(page);
  }, [fetchAlerts, page]);

  useEffect(() => {
    setPage(1);
  }, [appliedFilters]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getAlertTime = (alert) => (
    alert?.alerted_at || alert?.triggered_at || alert?.timestamp || null
  );

  const formatAlertTime = (alert) => {
    const value = getAlertTime(alert);
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return formatDateTime(parsed);
  };

  const formatConfidence = (alert) => {
    const raw = alert?.confidence ?? alert?.final_confidence ?? alert?.confidence_score ?? null;
    if (raw === null || raw === undefined || raw === '') return '—';
    const value = Number(raw);
    if (Number.isNaN(value)) return '—';
    const normalized = value > 1 ? value / 100 : value;
    return `${(normalized * 100).toFixed(1)}%`;
  };

  const statusBadge = (status) => {
    const base = 'px-2.5 py-1 rounded-full text-xs font-semibold border';
    if (status === 'acknowledged') {
      return (
        <span className={`${base} bg-blue-100 text-blue-700 border-blue-200`}>
          Acknowledged
        </span>
      );
    }
    return (
      <span className={`${base} bg-rose-100 text-rose-700 border-rose-200`}>
        Unacknowledged
      </span>
    );
  };

  const getThreatLevel = (alert) => {
    if (alert?.threat_level) return String(alert.threat_level);
    if (alert?.severity) return String(alert.severity);
    return alert?.status === 'acknowledged' ? 'Reviewed' : 'Critical';
  };

  const getIncidentKey = (alert) => (
    alert.id || alert.alert_id || `${alert.zone_id || 'zone'}-${getAlertTime(alert) || 'time'}`
  );

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading alert history">
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
      <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-6 text-center">
        <p className="text-rose-400">{error}</p>
        <button
          onClick={() => fetchAlerts(page)}
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
      aria-label="Alert history table"
      className="relative space-y-4"
    >
      <div className="relative flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-medium text-slate-900">Incident History</p>
          <p className="text-xs text-slate-500">Master view of historical alert events</p>
        </div>
        <button
          onClick={() => setIsFilterOpen((prev) => !prev)}
          className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-full px-4 py-2 transition-all"
          aria-expanded={isFilterOpen}
          aria-controls="incident-filter-panel"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5.25h18m-15 6h12m-9 6h6" />
          </svg>
          Add Filter
        </button>

        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              id="incident-filter-panel"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
              className="bg-white/90 backdrop-blur-md shadow-lg rounded-2xl p-4 mt-2 absolute z-10 right-0 top-full w-full max-w-4xl border border-slate-200"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <input
                  aria-label="Filter alerts by zone ID"
                  value={draftFilters?.zone_id || ''}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, zone_id: e.target.value }))}
                  placeholder="Zone ID"
                  className="input-field bg-white"
                />
                <div className="relative">
                  <StatusDropdown
                    value={draftFilters?.status || ''}
                    onChange={(nextStatus) => setDraftFilters((prev) => ({ ...prev, status: nextStatus }))}
                  />
                </div>
                <input
                  type="number"
                  aria-label="Filter alerts by minimum confidence"
                  min="0"
                  max="1"
                  step="0.01"
                  value={draftFilters?.min_confidence || ''}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, min_confidence: e.target.value }))}
                  placeholder="Min confidence"
                  className="input-field bg-white"
                />
                <CalendarInput
                  ariaLabel="Filter alerts from datetime"
                  value={draftFilters?.from || ''}
                  onChange={(nextDate) => setDraftFilters((prev) => ({ ...prev, from: nextDate }))}
                  popoverAlign="left"
                />
                <CalendarInput
                  ariaLabel="Filter alerts to datetime"
                  value={draftFilters?.to || ''}
                  onChange={(nextDate) => setDraftFilters((prev) => ({ ...prev, to: nextDate }))}
                  popoverAlign="right"
                />
              </div>
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                <button
                  onClick={() => {
                    resetTriageFilters();
                    const cleared = {
                      zone_id: '',
                      status: '',
                      min_confidence: '',
                      from: '',
                      to: '',
                    };
                    setDraftFilters(cleared);
                    setAppliedFilters(cleared);
                    setTriageFilters(cleared);
                  }}
                  className="px-3 py-1.5 text-xs rounded-full text-slate-500 hover:text-slate-800 transition-all focus-ring"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    const next = {
                      zone_id: draftFilters?.zone_id || '',
                      status: draftFilters?.status || '',
                      min_confidence: draftFilters?.min_confidence || '',
                      from: draftFilters?.from ? formatDateInput(draftFilters.from) : '',
                      to: draftFilters?.to ? formatDateInput(draftFilters.to) : '',
                    };
                    setAppliedFilters(next);
                    setTriageFilters(next);
                  }}
                  className="bg-slate-800 text-white rounded-full px-4 py-2 text-sm hover:bg-slate-700 shadow-md transition-all"
                >
                  Apply Filters
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {refreshing && (
        <p className="mt-2 text-xs text-slate-400">Refreshing alerts…</p>
      )}

      <div
        className="rounded-2xl border border-[#e7ecef] bg-[#ffffff] shadow-sm overflow-hidden"
        data-testid="incident-master-list"
      >
        {alerts.length === 0 ? (
          <div className="text-center py-10 text-slate-500">No alerts found.</div>
        ) : (
          <div className="divide-y divide-[#e7ecef]">
            {alerts.map((alert) => (
              <button
                key={getIncidentKey(alert)}
                type="button"
                onClick={() => setSelectedIncident(alert)}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 hover:shadow-sm cursor-pointer transition-all"
                data-testid="incident-row"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {alert.zone_name || alert.zone_id || '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{formatAlertTime(alert)}</p>
                  </div>
                  <div className="md:col-span-3 text-sm text-slate-700">
                    Confidence: {formatConfidence(alert)}
                  </div>
                  <div className="md:col-span-3">{statusBadge(alert.status)}</div>
                  <div className="md:col-span-2 text-xs text-slate-500 text-left md:text-right">
                    {alert.acknowledged_by_username || alert.acknowledged_by || '—'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

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

      <AnimatePresence>
        {selectedIncident && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedIncident(null)}
            />
            <motion.aside
              className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-md border-l border-[#e7ecef] p-6 overflow-y-auto"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
              aria-label="Incident detail drawer"
              data-testid="incident-detail-drawer"
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Incident Details</p>
                  <h3 className="text-xl font-semibold text-slate-900 mt-1">
                    {selectedIncident.zone_name || selectedIncident.zone_id || 'Unknown Zone'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIncident(null)}
                  className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 transition-all"
                  aria-label="Close incident details"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="rounded-2xl border border-[#e7ecef] bg-[#a3cef1]/15 p-4 mb-5">
                <p className="text-xs font-medium text-slate-600 mb-3">Event Snapshot</p>
                <div className="h-44 rounded-2xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-slate-400 text-sm">
                  Snapshot placeholder
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500 mb-1">Timestamp</p>
                  <p className="text-sm font-medium text-slate-900">{formatAlertTime(selectedIncident)}</p>
                </div>
                <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500 mb-1">Zone Name</p>
                  <p className="text-sm font-medium text-slate-900">
                    {selectedIncident.zone_name || selectedIncident.zone_id || '—'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">AI Confidence</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatConfidence(selectedIncident)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#e7ecef] bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500 mb-1">Threat Level</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {getThreatLevel(selectedIncident)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  className="w-full rounded-2xl bg-slate-900 text-white px-4 py-3 text-sm font-medium hover:bg-slate-800 transition-all shadow-sm"
                >
                  {selectedIncident.status === 'acknowledged' ? 'Export Report' : 'Acknowledge'}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export default AlertHistory;
