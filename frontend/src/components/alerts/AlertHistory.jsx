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
import PremiumLoader from '../layout/PremiumLoader.jsx';
import useClipsApi from '../../hooks/useClipsApi';
import ClipPlayer from '../events/ClipPlayer.jsx';
import ClipReviewControls from '../events/ClipReviewControls.jsx';

const PAGE_SIZE = 10;
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
        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-left text-xs font-mono tracking-widest uppercase text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-all hover:border-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
        aria-label={ariaLabel}
      >
        {selectedDate || 'SELECT DATE'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className={`absolute top-11 z-20 w-[min(280px,calc(100vw-2rem))] rounded border border-slate-700 bg-slate-900 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.8)] ${
              popoverAlign === 'right' ? 'right-0' : 'left-0'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() - 1, 1))}
                className="h-8 w-8 rounded hover:bg-slate-800 text-slate-400"
              >
                ‹
              </button>
              <p className="text-[11px] font-mono font-bold tracking-wider uppercase text-slate-200">
                {cursorDate.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
              </p>
              <button
                type="button"
                onClick={() => setCursorDate(new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 1))}
                className="h-8 w-8 rounded hover:bg-slate-800 text-slate-400"
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
                    className={`h-9 rounded text-[11px] font-mono tracking-wider transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                        : 'text-slate-400 hover:bg-slate-800 border border-transparent'
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

function AlertHistory({ headerTabs }) {
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
  const [clipMetadata, setClipMetadata] = useState(null);
  const [fetchingClip, setFetchingClip] = useState(false);
  const requestIdRef = useRef(0);
  const { getClipMetadata, fetchClips } = useClipsApi();

  useEffect(() => {
    if (!selectedIncident) {
      setClipMetadata(null);
      return;
    }
    const loadClip = async () => {
      setFetchingClip(true);
      try {
        // Find if this incident has an associated pending/confirmed clip
        // Use event_id which might be in the incident payload
        const eventId = selectedIncident.event_id || selectedIncident.id;
        const res = await fetchClips({ event_id: eventId, limit: 1 });
        const clips = res?.clips || res;
        if (Array.isArray(clips) && clips.length > 0) {
          const metadata = await getClipMetadata(clips[0].clip_id);
          setClipMetadata(metadata);
        } else {
          setClipMetadata(null);
        }
      } catch (err) {
        setClipMetadata(null);
      } finally {
        setFetchingClip(false);
      }
    };
    loadClip();
  }, [selectedIncident, fetchClips, getClipMetadata]);

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
      const res = await api.get('/api/v1/alerts', {
        params: {
          page: pageNum,
          limit: PAGE_SIZE,
          ...(filterState.zone_id ? { zone_id: filterState.zone_id } : {}),
          ...(minConfidence !== null ? { min_confidence: minConfidence } : {}),
          ...(isValidDateFilter(filterState.from) ? { from: filterState.from } : {}),
          ...(isValidDateFilter(filterState.to) ? { to: filterState.to } : {}),
        },
      });
      const data = res?.data?.data ?? res?.data;
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
    return parsed.toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit'
    });
  };

  const formatConfidence = (alert) => {
    const raw = alert?.confidence ?? alert?.final_confidence ?? alert?.confidence_score ?? null;
    if (raw === null || raw === undefined || raw === '') return '—';
    const value = Number(raw);
    if (Number.isNaN(value)) return '—';
    const normalized = value > 1 ? value / 100 : value;
    return `${(normalized * 100).toFixed(1)}%`;
  };

  const formatStatus = (alert) => {
    const status = alert?.status || 'unacknowledged';
    if (status === 'acknowledged') {
      return (
        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-500 ring-1 ring-inset ring-amber-500/20 uppercase tracking-widest">
          {alert.acknowledged_by ? `CLAIMED BY ${alert.acknowledged_by}` : 'CLAIMED'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-500 ring-1 ring-inset ring-rose-500/20 uppercase tracking-widest">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5 animate-pulse" />
        UNACKNOWLEDGED
      </span>
    );
  };

  const getThreatLevel = (alert) => {
    if (alert?.threat_level) return String(alert.threat_level);
    if (alert?.severity) return String(alert.severity);
    return 'Critical';
  };

  const getIncidentKey = (alert) => (
    alert.id || alert.alert_id || `${alert.zone_id || 'zone'}-${getAlertTime(alert) || 'time'}`
  );

  if (loading) {
    return <PremiumLoader />;
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
      className="relative rounded-xl border border-slate-800 bg-[#0a0f18] shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col"
    >
      <div className="relative flex items-center justify-between px-6 border-b border-slate-800 bg-[#0a0f18] rounded-t-xl">
        {headerTabs ? headerTabs : (
          <div className="py-4">
            <p className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">Incident History</p>
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Master view of historical alert events</p>
          </div>
        )}
        
        <div className="py-3">
          <button
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase transition-all ${
              isFilterOpen 
                ? 'bg-slate-800 text-slate-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-slate-700' 
                : 'bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700 shadow-sm'
            }`}
            aria-expanded={isFilterOpen}
            aria-controls="incident-filter-panel"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            FILTERS
          </button>
        </div>

        <AnimatePresence>
          {isFilterOpen && (
            <motion.div
              id="incident-filter-panel"
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="absolute z-20 right-6 top-[100%] mt-2 w-[calc(100%-3rem)] max-w-4xl bg-[#0a0f18]/95 backdrop-blur-xl shadow-[0_16px_64px_rgba(0,0,0,0.8)] rounded p-5 border border-slate-700"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  aria-label="Filter alerts by zone ID"
                  value={draftFilters?.zone_id || ''}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, zone_id: e.target.value }))}
                  placeholder="ZONE ID"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-[11px] font-mono tracking-widest text-slate-300 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                />
                <input
                  type="number"
                  aria-label="Filter alerts by minimum confidence"
                  min="0"
                  max="1"
                  step="0.01"
                  value={draftFilters?.min_confidence || ''}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, min_confidence: e.target.value }))}
                  placeholder="MIN CONFIDENCE"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-[11px] font-mono tracking-widest text-slate-300 placeholder-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
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
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
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
                  className="px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest uppercase rounded text-slate-500 hover:text-slate-300 transition-all focus-ring"
                >
                  RESET
                </button>
                <button
                  onClick={() => {
                    const next = {
                      zone_id: draftFilters?.zone_id || '',
                      min_confidence: draftFilters?.min_confidence || '',
                      from: draftFilters?.from ? formatDateInput(draftFilters.from) : '',
                      to: draftFilters?.to ? formatDateInput(draftFilters.to) : '',
                    };
                    setAppliedFilters(next);
                    setTriageFilters(next);
                  }}
                  className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded px-4 py-2 text-[10px] font-mono font-bold tracking-widest uppercase hover:bg-cyan-500/20 hover:border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)] transition-all"
                >
                  APPLY
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {refreshing && (
        <div className="px-6 py-2 border-b border-slate-800 bg-slate-900 text-[10px] font-mono tracking-widest text-cyan-400 uppercase">
          Refreshing alerts…
        </div>
      )}

      <div className="flex-1 overflow-hidden" data-testid="incident-master-list">
        {alerts.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded border border-slate-800 bg-slate-900">
              <svg className="h-7 w-7 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-slate-400">ALL CLEAR</p>
            <p className="text-[9px] font-mono tracking-widest uppercase text-slate-600 mt-1">No alerts found for the selected filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {alerts.map((alert) => (
              <button
                key={getIncidentKey(alert)}
                type="button"
                onClick={() => setSelectedIncident(alert)}
                className="w-full text-left px-5 py-4 hover:bg-slate-900/50 hover:shadow-[inset_0_0_12px_rgba(0,0,0,0.5)] cursor-pointer transition-all border-l-2 border-transparent hover:border-l-rose-500 group flex items-center justify-between gap-4"
                data-testid="incident-row"
              >
                {/* Left: Zone & Time */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase truncate">
                      {alert.zone_name || alert.zone_id || 'UNKNOWN ZONE'}
                    </p>
                    {formatStatus(alert)}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono tracking-widest uppercase">{formatAlertTime(alert)}</p>
                </div>

                {/* Right: Confidence & Icon */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="hidden sm:flex flex-col items-end">
                    <p className="text-[9px] uppercase tracking-[0.2em] font-mono font-bold text-slate-500 mb-0.5">Confidence</p>
                    <p className="text-sm font-bold text-cyan-400 font-mono drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">{formatConfidence(alert)}</p>
                  </div>
                  
                  <div className="w-8 h-8 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 group-hover:bg-rose-500/10 group-hover:border-rose-500/50 group-hover:text-rose-400 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-800 bg-[#0a0f18] flex items-center justify-between text-xs font-mono font-bold tracking-widest text-slate-500 uppercase rounded-b-xl">
          <span>
            Page {page} of {totalPages} &nbsp;({total} TOTAL)
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

      <AnimatePresence>
        {selectedIncident && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedIncident(null)}
            />
            
            <motion.div
              className="relative w-full max-w-[95vw] xl:max-w-6xl 2xl:max-w-7xl bg-[#0a0f18] shadow-[0_16px_64px_rgba(0,0,0,0.8)] border border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 sm:gap-8 animate-in fade-in zoom-in-95 duration-200"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              role="dialog"
              aria-modal="true"
            >
              {/* Media Player Container */}
              <div className="w-full md:w-[60%] bg-[#05080f] flex items-center justify-center min-h-[300px] rounded border border-slate-800 overflow-hidden shadow-[inset_0_4px_24px_rgba(0,0,0,0.6)] relative group">
                {fetchingClip ? (
                  <PremiumLoader />
                ) : clipMetadata ? (
                  <ClipPlayer clipId={clipMetadata.clip_id} metadata={clipMetadata} />
                ) : selectedIncident.video_url || selectedIncident.videoUrl ? (
                  <video 
                    src={selectedIncident.video_url || selectedIncident.videoUrl} 
                    controls 
                    autoPlay 
                    muted 
                    className="w-full h-full object-cover aspect-video"
                  />
                ) : selectedIncident.snapshot_url || selectedIncident.snapshotUrl ? (
                  <img
                    src={selectedIncident.snapshot_url || selectedIncident.snapshotUrl}
                    alt="Event snapshot"
                    className="w-full h-full object-cover aspect-video"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-600 p-10 h-full w-full aspect-video">
                    <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-[10px] font-mono tracking-widest uppercase font-bold">MEDIA UNAVAILABLE</p>
                  </div>
                )}
              </div>

              {/* Bento Grid Metadata */}
              <div className="w-full md:w-[40%] flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-8">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-mono font-bold mb-1.5">Incident Details</p>
                      <h3 className="text-2xl font-mono font-bold text-slate-200 tracking-wider uppercase">
                        {selectedIncident.zone_name || selectedIncident.zone_id || 'UNKNOWN ZONE'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedIncident(null)}
                      className="rounded bg-slate-900 border border-slate-800 p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
                      aria-label="Close incident details"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="rounded bg-slate-900 p-4 border border-slate-800 transition-colors hover:bg-slate-800/50 hover:border-slate-700">
                      <p className="text-[9px] uppercase tracking-widest font-mono font-bold text-slate-500 mb-1.5">Timestamp</p>
                      <p className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">{formatAlertTime(selectedIncident)}</p>
                    </div>
                    <div className={`rounded bg-slate-900 p-4 border transition-colors ${selectedIncident.status === 'acknowledged' ? 'border-amber-500/20 hover:bg-slate-800/50 hover:border-amber-500/40' : 'border-rose-500/20 hover:bg-slate-800/50 hover:border-rose-500/40'}`}>
                      <p className="text-[9px] uppercase tracking-widest font-mono font-bold text-slate-500 mb-1.5">Status</p>
                      <p className={`text-xs font-mono font-bold uppercase tracking-widest ${selectedIncident.status === 'acknowledged' ? 'text-amber-500' : 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]'}`}>
                        {selectedIncident.status === 'acknowledged' ? `CLAIMED${selectedIncident.acknowledged_by ? ` BY ${selectedIncident.acknowledged_by}` : ''}` : 'UNACKNOWLEDGED'}
                      </p>
                    </div>
                    <div className="rounded bg-slate-900 p-4 border border-slate-800 transition-colors hover:bg-slate-800/50 hover:border-slate-700">
                      <p className="text-[9px] uppercase tracking-widest font-mono font-bold text-slate-500 mb-1.5">Confidence</p>
                      <p className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-widest">{formatConfidence(selectedIncident)}</p>
                    </div>
                    <div className="rounded bg-slate-900 p-4 border border-slate-800 transition-colors hover:bg-slate-800/50 hover:border-slate-700">
                      <p className="text-[9px] uppercase tracking-widest font-mono font-bold text-slate-500 mb-1.5">Threat Level</p>
                      <p className="text-xs font-mono font-bold text-rose-400 uppercase tracking-widest">{getThreatLevel(selectedIncident)}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-6">
                  {clipMetadata && clipMetadata.review?.status === 'pending' ? (
                    <div className="w-full">
                      <ClipReviewControls 
                        clipId={clipMetadata.clip_id} 
                        onSuccess={() => {
                          setSelectedIncident(null);
                          // We optimistically close the modal.
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedIncident(null)}
                        className="px-6 py-3 rounded text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 border border-slate-700 hover:bg-slate-800 hover:text-slate-200 transition-colors focus-ring"
                      >
                        CLOSE
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIncident(null)}
                        className="px-6 py-3 rounded text-[10px] font-mono font-bold tracking-widest uppercase text-[#0a0f18] bg-cyan-400 hover:bg-cyan-300 transition-colors shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                      >
                        DOWNLOAD LOG
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

export default AlertHistory;
