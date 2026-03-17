/**
 * AquaGuard — DetectionFeed component.
 *
 * Live scrolling log of the most recent detection events.
 * Polls GET /api/v1/events every 5 seconds for the latest entries.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';

const POLL_INTERVAL_MS = 5000;
const MAX_DISPLAY = 20;

function DetectionFeed() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/events', {
        params: { limit: MAX_DISPLAY, page: 1 },
      });
      const data = Array.isArray(res.data) ? res.data : res.data.events || [];
      setEvents(data);
      setError(null);
    } catch (err) {
      setError('Could not fetch detection events.');
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    intervalRef.current = setInterval(fetchLatest, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchLatest]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Live Detection Feed</h3>
        <span className="flex items-center gap-1.5 text-xs text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
      </div>

      {error && (
        <p className="px-4 py-2 text-xs text-red-600 bg-red-50">{error}</p>
      )}

      <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
        {events.length === 0 && !error ? (
          <li className="px-4 py-6 text-center text-slate-400 text-sm">
            No detection events yet.
          </li>
        ) : (
          events.map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-sm"
            >
              {/* Alert indicator */}
              <span
                className={`mt-0.5 shrink-0 w-2.5 h-2.5 rounded-full ${
                  ev.alert_triggered ? 'bg-red-500' : 'bg-sky-400'
                }`}
                title={ev.alert_triggered ? 'Alert triggered' : 'Detection only'}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 truncate">
                  {ev.class_label || 'Person detected'}
                  {ev.alert_triggered && (
                    <span className="ml-2 text-xs text-red-600 font-semibold">⚠ ALERT</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {ev.zone_name || ev.zone_id || '—'} &nbsp;·&nbsp;
                  {ev.final_confidence != null
                    ? `${(ev.final_confidence * 100).toFixed(0)}% confidence`
                    : ''}
                </p>
              </div>
              <time className="shrink-0 text-xs text-slate-400 whitespace-nowrap">
                {formatDateTime(ev.detected_at)}
              </time>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default DetectionFeed;
