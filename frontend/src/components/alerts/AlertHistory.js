/**
 * AquaGuard — AlertHistory component.
 *
 * Paginated table of past alerts fetched from GET /api/v1/alerts.
 * Columns: time, zone, confidence, status, acknowledged by.
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';
import { useFilterState } from '../../context/AlertContext';

const PAGE_SIZE = 10;

function AlertHistory() {
  const { triageFilters, setTriageFilters, resetTriageFilters } = useFilterState();
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [draftFilters, setDraftFilters] = useState(triageFilters || {});

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

  const fetchAlerts = useCallback(async (pageNum) => {
    if (alerts.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      const filterState = triageFilters || {};
      const res = await api.get('/api/v1/alerts', {
        params: {
          page: pageNum,
          limit: PAGE_SIZE,
          ...(filterState.zone_id ? { zone_id: filterState.zone_id } : {}),
          ...(filterState.status ? { status: filterState.status } : {}),
          ...(filterState.min_confidence ? { min_confidence: filterState.min_confidence } : {}),
          ...(filterState.from ? { from: filterState.from } : {}),
          ...(filterState.to ? { to: filterState.to } : {}),
        },
      });
      const data = res.data;
      // Backend may return { alerts: [...], total: N } or directly an array
      if (Array.isArray(data)) {
        setAlerts(data);
        setTotal(data.length);
      } else {
        setAlerts(data.alerts || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load alert history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [triageFilters, alerts.length]);

  useEffect(() => {
    fetchAlerts(page);
  }, [fetchAlerts, page]);

  useEffect(() => {
    setPage(1);
  }, [triageFilters]);

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
    const base = 'px-2 py-0.5 rounded-full text-xs font-semibold';
    if (status === 'acknowledged')
      return <span className={`${base} bg-green-100 text-green-700`}>Acknowledged</span>;
    return <span className={`${base} bg-red-100 text-red-700`}>Unacknowledged</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
        <svg className="animate-spin h-5 w-5 mr-2 text-sky-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading alerts…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => fetchAlerts(page)}
          className="mt-2 px-4 py-1.5 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            aria-label="Filter alerts by zone ID"
            value={draftFilters?.zone_id || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, zone_id: e.target.value }))}
            placeholder="Zone ID"
            className="px-3 py-2 text-sm rounded border border-slate-300"
          />
          <select
            aria-label="Filter alerts by status"
            value={draftFilters?.status || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 text-sm rounded border border-slate-300"
          >
            <option value="">All statuses</option>
            <option value="unacknowledged">Unacknowledged</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
          <input
            type="number"
            aria-label="Filter alerts by minimum confidence"
            min="0"
            max="1"
            step="0.01"
            value={draftFilters?.min_confidence || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, min_confidence: e.target.value }))}
            placeholder="Min confidence"
            className="px-3 py-2 text-sm rounded border border-slate-300"
          />
          <input
            type="datetime-local"
            aria-label="Filter alerts from datetime"
            value={draftFilters?.from || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, from: e.target.value }))}
            className="px-3 py-2 text-sm rounded border border-slate-300"
          />
          <input
            type="datetime-local"
            aria-label="Filter alerts to datetime"
            value={draftFilters?.to || ''}
            onChange={(e) => setDraftFilters((prev) => ({ ...prev, to: e.target.value }))}
            className="px-3 py-2 text-sm rounded border border-slate-300"
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
            className="px-3 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
          >
            Reset filters
          </button>
        </div>
      </div>

      {refreshing && (
        <p className="mt-2 text-xs text-slate-500">Refreshing alerts…</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Time', 'Zone', 'Confidence', 'Status', 'Acknowledged By'].map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-400">
                  No alerts found.
                </td>
              </tr>
            ) : (
              alerts.map((alert) => {
                return (
                  <tr key={alert.id || alert.alert_id || `${alert.zone_id || 'zone'}-${getAlertTime(alert) || 'time'}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {formatAlertTime(alert)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {alert.zone_name || alert.zone_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatConfidence(alert)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(alert.status)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {alert.acknowledged_by_username || alert.acknowledged_by || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AlertHistory;
