/**
 * AquaGuard — AlertHistory component.
 *
 * Paginated table of past alerts fetched from GET /api/v1/alerts.
 * Columns: time, zone, confidence, status, acknowledged by.
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';

const PAGE_SIZE = 10;

function AlertHistory() {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async (pageNum) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/alerts', {
        params: { page: pageNum, limit: PAGE_SIZE },
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
    }
  }, []);

  useEffect(() => {
    fetchAlerts(page);
  }, [fetchAlerts, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
                const confidence = alert.confidence ?? alert.final_confidence ?? null;
                return (
                  <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {formatDateTime(alert.alerted_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {alert.zone_name || alert.zone_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {confidence !== null
                        ? `${(Number(confidence) * 100).toFixed(1)}%`
                        : '—'}
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
