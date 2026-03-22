/**
 * AquaGuard — DetectionFeed component.
 *
 * Live scrolling log of the most recent detection events.
 * Polls GET /api/v1/events every 5 seconds for the latest entries.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api from '../../hooks/useApi';
import { formatDateTime } from '../../utils/dateFormat';
import { useAlertState, useSocketState } from '../../context/AlertContext';
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
  const intervalRef = useRef(null);
  const failureCountRef = useRef(0);

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
  }, [fetchLatest]);

  const hasRealtimeEvents = detectionEvents.length > 0;
  const events = hasRealtimeEvents ? detectionEvents.slice(0, MAX_DISPLAY) : polledEvents;
  const isStale = useMemo(() => {
    if (!lastPollAt) return false;
    return Date.now() - lastPollAt > STALE_AFTER_MS;
  }, [lastPollAt]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Live Detection Feed</h3>
        <span
          className={`flex items-center gap-1.5 text-xs ${
            socketConnected && !isStale ? 'text-green-600' : 'text-amber-600'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              socketConnected && !isStale
                ? 'bg-green-500 animate-pulse'
                : 'bg-amber-500'
            }`}
          />
          {socketConnected ? (isStale ? 'Live (stale)' : 'Live (socket)') : 'Polling fallback'}
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
          events.map((ev, idx) => {
            const confidence = mapEventConfidence(ev);
            const eventTime = mapEventTimestamp(ev);
            return (
              <li
                key={ev.event_id || ev.id || `${eventTime}-${idx}`}
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
                    {mapEventClassLabel(ev)}
                    {ev.alert_triggered && (
                      <span className="ml-2 text-xs text-red-600 font-semibold">⚠ ALERT</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {ev.zone_name || ev.zone_id || '—'} &nbsp;·&nbsp;
                    {confidence != null ? `${(confidence * 100).toFixed(0)}% confidence` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-slate-400 whitespace-nowrap">
                  {formatDateTime(eventTime)}
                </time>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export default DetectionFeed;
