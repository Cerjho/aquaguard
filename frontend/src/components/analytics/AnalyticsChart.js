/**
 * AquaGuard — AnalyticsChart component.
 *
 * Fetches GET /api/v1/reports/summary?group_by=zone and renders:
 * 1. BarChart — alert counts per zone
 * 2. LineChart — detections over time (last 7 days)
 *
 * Uses Recharts library (pinned 2.12.7).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import api from '../../hooks/useApi';
import { useFilterState } from '../../context/AlertContext';

function AnalyticsChart() {
  const navigate = useNavigate();
  const { setTriageFilters } = useFilterState();
  const [rangeDays, setRangeDays] = useState('7');
  const [groupBy, setGroupBy] = useState('zone');
  const [zoneData, setZoneData] = useState([]);
  const [timeData, setTimeData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const fetchSummary = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/reports/summary', {
        params: {
          group_by: groupBy,
          ...(rangeDays ? { from: new Date(Date.now() - Number(rangeDays) * 86400000).toISOString() } : {}),
        },
      });
      const data = res.data;

      // Normalize zone data: expects { zones: [{zone_name, alert_count, event_count}] }
      // or a flat array
      const zones = Array.isArray(data)
        ? data
        : data.zones || data.by_zone || [];

      if (requestId !== requestIdRef.current) return;

      const normalizedZones = zones.map((z) => ({
        zoneId: z.zone_id || z.zone_name || 'Unknown',
        zone: z.zone_name || z.zone_id || 'Unknown',
        alerts: z.alert_count ?? z.alerts ?? 0,
        detections: z.event_count ?? z.detections ?? 0,
      }));
      setZoneData(normalizedZones);

      // Time series: expects { daily: [{date, alert_count, event_count}] }
      const daily = data.daily || data.by_date || [];
      let normalizedTime;
      if (Array.isArray(daily) && daily.length > 0) {
        normalizedTime = daily.map((d) => ({
          date: d.date,
          alerts: d.alert_count ?? d.alerts ?? 0,
          detections: d.event_count ?? d.detections ?? 0,
        }));
      } else {
        // Graceful fallback when backend omits daily in this response.
        normalizedTime = zones.map((z, idx) => ({
          date: z.zone_name || z.zone_id || `Zone ${idx + 1}`,
          alerts: z.alert_count ?? z.alerts ?? 0,
          detections: z.event_count ?? z.detections ?? 0,
        }));
      }
      setTimeData(normalizedTime);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(
        err.response?.data?.message || 'Failed to load analytics data.'
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [rangeDays, groupBy]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleZoneDrilldown = useCallback((entry) => {
    if (!entry?.zoneId) return;
    setTriageFilters({ zone_id: entry.zoneId });
    navigate('/incidents');
  }, [navigate, setTriageFilters]);

  const handleTimeDrilldown = useCallback((entry) => {
    if (!entry?.date) return;
    const from = new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 16);
    const to = new Date(`${entry.date}T23:59:59Z`).toISOString().slice(0, 16);
    setTriageFilters({ from, to });
    navigate('/incidents');
  }, [navigate, setTriageFilters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 text-sm gap-2">
        <svg className="animate-spin h-5 w-5 text-sky-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchSummary}
          className="mt-2 px-4 py-1.5 text-sm rounded-lg bg-red-100 hover:bg-red-200 text-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-slate-600">
            Time Range
            <select
              className="mt-1 w-full px-3 py-2 rounded border border-slate-300"
              value={rangeDays}
              onChange={(e) => setRangeDays(e.target.value)}
            >
              <option value="1">Last 24 hours</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Grouping
            <select
              className="mt-1 w-full px-3 py-2 rounded border border-slate-300"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              <option value="zone">By zone</option>
              <option value="day">By day</option>
            </select>
          </label>
        </div>
      </div>

      {/* ── Bar Chart: Alerts per Zone ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-semibold text-slate-700 mb-4">
          Alert Counts by Zone
        </h3>
        {zoneData.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No zone data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={zoneData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                onClick={(state) => handleZoneDrilldown(state?.activePayload?.[0]?.payload)}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="zone"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="alerts" name="Alerts" fill="#dc2626" radius={[4, 4, 0, 0]} />
              <Bar dataKey="detections" name="Detections" fill="#0369a1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Line Chart: Detections over time ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-semibold text-slate-700 mb-4">
          Detections Over Time (Last 7 Days)
        </h3>
        {timeData.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">No time-series data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={timeData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                onClick={(state) => handleTimeDrilldown(state?.activePayload?.[0]?.payload)}
              >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  fontSize: '13px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="alerts"
                name="Alerts"
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ r: 4, fill: '#dc2626' }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="detections"
                name="Detections"
                stroke="#0369a1"
                strokeWidth={2}
                dot={{ r: 4, fill: '#0369a1' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default AnalyticsChart;
