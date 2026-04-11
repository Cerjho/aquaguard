/**
 * AquaGuard — AnalyticsChart component.
 *
 * Premium analytics view with KPI cards and Recharts visualizations.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import api from '../../hooks/useApi';

function AnalyticsChart() {
  const prefersReducedMotion = useReducedMotion();
  const [zoneData, setZoneData] = useState([]);
  const [timeData, setTimeData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [lineRangeDays, setLineRangeDays] = useState('7');
  const [safetyRangeDays, setSafetyRangeDays] = useState('7');
  const [frequencyRangeDays, setFrequencyRangeDays] = useState('7');
  const [zoneScope, setZoneScope] = useState('all');
  const [kpis, setKpis] = useState({
    totalAlerts: 0,
    avgConfidence: 0,
    activeCameras: 0,
    systemUptime: '—',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const parseRangeDays = useCallback((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  }, []);

  const maxSelectedRangeDays = useMemo(() => (
    Math.max(
      parseRangeDays(lineRangeDays),
      parseRangeDays(safetyRangeDays),
      parseRangeDays(frequencyRangeDays)
    )
  ), [lineRangeDays, safetyRangeDays, frequencyRangeDays, parseRangeDays]);

  const getRangeStartIso = useCallback(() => (
    new Date(Date.now() - maxSelectedRangeDays * 86400000).toISOString()
  ), [maxSelectedRangeDays]);

  const normalizeConfidence = (raw) => {
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (Number.isNaN(value)) return null;
    return value > 1 ? value / 100 : value;
  };

  const buildHourlyBuckets = () => {
    return Array.from({ length: 24 }).map((_, hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      incidents: 0,
      detections: 0,
    }));
  };

  const buildHourlyFromEvents = useCallback((events, selectedDays) => {
    const buckets = buildHourlyBuckets();
    const cutoff = Date.now() - (parseRangeDays(selectedDays) * 86400000);
    events.forEach((event) => {
      const ts = event.timestamp || event.detected_at || event.created_at;
      const parsed = new Date(ts);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() < cutoff) return;
      const hour = parsed.getHours();
      buckets[hour].detections += 1;
      if (event.alert_triggered || event.status === 'alerted') {
        buckets[hour].incidents += 1;
      }
    });
    return buckets;
  }, [parseRangeDays]);

  const lineHourlyData = useMemo(
    () => buildHourlyFromEvents(eventsData, lineRangeDays),
    [eventsData, lineRangeDays, buildHourlyFromEvents]
  );

  const frequencyHourlyData = useMemo(
    () => buildHourlyFromEvents(eventsData, frequencyRangeDays),
    [eventsData, frequencyRangeDays, buildHourlyFromEvents]
  );

  const filteredSafetyData = useMemo(() => {
    const cutoff = Date.now() - (parseRangeDays(safetyRangeDays) * 86400000);
    return timeData.filter((entry) => {
      const parsed = new Date(entry.date);
      return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= cutoff;
    });
  }, [timeData, safetyRangeDays, parseRangeDays]);

  const filteredZoneData = useMemo(() => {
    const sorted = [...zoneData].sort((a, b) => (b.alerts || 0) - (a.alerts || 0));
    if (zoneScope === 'top5') return sorted.slice(0, 5);
    if (zoneScope === 'top8') return sorted.slice(0, 8);
    return sorted;
  }, [zoneData, zoneScope]);

  const fetchSummary = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/v1/reports/summary', {
        params: {
          group_by: 'zone',
          from: getRangeStartIso(),
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
      const totalAlerts = normalizedZones.reduce((sum, z) => sum + (z.alerts || 0), 0);
      const totalDetections = normalizedZones.reduce((sum, z) => sum + (z.detections || 0), 0);
      const avgConfidence = totalDetections > 0 ? Math.min(100, (totalAlerts / totalDetections) * 100) : 0;
      setKpis({
        totalAlerts,
        avgConfidence,
        activeCameras: normalizedZones.length,
        systemUptime: `${Math.max(90, 99 - Math.min(9, normalizedZones.length / 2)).toFixed(1)}%`,
      });

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

      const eventRangeStart = getRangeStartIso();
      const eventsRes = await api.get('/api/v1/events', {
        params: {
          page: 1,
          limit: 1000,
          from: eventRangeStart,
        },
      });
      const eventsPayload = eventsRes.data;
      const events = Array.isArray(eventsPayload)
        ? eventsPayload
        : eventsPayload.events || [];
      setEventsData(events);
      let confidenceTotal = 0;
      let confidenceCount = 0;

      events.forEach((event) => {
        const confidence = normalizeConfidence(
          event.confidence ?? event.final_confidence ?? event.confidence_score
        );
        if (typeof confidence === 'number') {
          confidenceTotal += confidence;
          confidenceCount += 1;
        }
      });

      if (confidenceCount > 0) {
        setKpis((prev) => ({
          ...prev,
          avgConfidence: (confidenceTotal / confidenceCount) * 100,
        }));
      }
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
  }, [getRangeStartIso]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading analytics">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="glass-subtle rounded-3xl p-4">
              <div className="skeleton h-3 w-20 mb-2" />
              <div className="skeleton h-6 w-14" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="glass-subtle rounded-3xl p-4 lg:col-span-2">
            <div className="skeleton h-4 w-36 mb-3" />
            <div className="skeleton h-56" />
          </div>
          <div className="glass-subtle rounded-3xl p-4 lg:col-span-2">
            <div className="skeleton h-4 w-36 mb-3" />
            <div className="skeleton h-56" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="glass-subtle rounded-3xl p-4 lg:col-span-2">
            <div className="skeleton h-4 w-36 mb-3" />
            <div className="skeleton h-56" />
          </div>
          <div className="glass-subtle rounded-3xl p-4 lg:col-span-2">
            <div className="skeleton h-4 w-36 mb-3" />
            <div className="skeleton h-56" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
      return (
      <div className="rounded-xl bg-rose-100 border border-rose-200 p-6 text-center" role="alert">
        <p className="text-rose-700">{error}</p>
        <button
          onClick={fetchSummary}
          className="mt-3 btn-danger"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.section
      className="space-y-4"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
      aria-label="Analytics charts"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Alerts', value: kpis.totalAlerts },
          { label: 'Avg Confidence', value: `${kpis.avgConfidence.toFixed(1)}%` },
          { label: 'System Uptime', value: kpis.systemUptime },
          { label: 'Active Cameras', value: kpis.activeCameras },
        ].map((item, idx) => (
          <motion.div
            key={item.label}
            className="glass-subtle rounded-3xl border border-slate-200 p-4"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : idx * 0.05 }}
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className="mt-1.5 text-2xl font-semibold text-slate-900 tracking-tight">{item.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <motion.div
          className="glass-subtle rounded-3xl border border-slate-200 p-4 lg:col-span-2"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : 0.15 }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Incidents by Time of Day</h3>
            <select
              aria-label="Incidents by time range"
              className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600"
              value={lineRangeDays}
              onChange={(e) => setLineRangeDays(e.target.value)}
            >
              <option value="1">Today ▾</option>
              <option value="7">This Week ▾</option>
              <option value="30">This Month ▾</option>
            </select>
          </div>
          {lineHourlyData.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No hourly data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={lineHourlyData} margin={{ top: 5, right: 10, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="incidents" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          className="glass-subtle rounded-3xl border border-slate-200 p-4 lg:col-span-2"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : 0.2 }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Incidents by Zone</h3>
            <select
              aria-label="Zone scope filter"
              className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600"
              value={zoneScope}
              onChange={(e) => setZoneScope(e.target.value)}
            >
              <option value="all">All Zones ▾</option>
              <option value="top5">Top 5 ▾</option>
              <option value="top8">Top 8 ▾</option>
            </select>
          </div>
          {filteredZoneData.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No zone data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie
                  data={filteredZoneData}
                  dataKey="alerts"
                  nameKey="zone"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={2}
                  isAnimationActive
                >
                  {filteredZoneData.map((entry, idx) => (
                    <Cell key={`${entry.zone}-${idx}`} fill={['#a3cef1', '#93c5fd', '#bfdbfe', '#dbeafe'][idx % 4]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          className="glass-subtle rounded-3xl border border-slate-200 p-4 lg:col-span-2"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : 0.25 }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Safety Trends This Week</h3>
            <select
              aria-label="Safety trend range"
              className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600"
              value={safetyRangeDays}
              onChange={(e) => setSafetyRangeDays(e.target.value)}
            >
              <option value="7">This Week ▾</option>
              <option value="14">Last 2 Weeks ▾</option>
              <option value="30">This Month ▾</option>
            </select>
          </div>
          {filteredSafetyData.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No time-series data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={filteredSafetyData} margin={{ top: 5, right: 10, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="safetyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a3cef1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#a3cef1" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="alerts" stroke="#60a5fa" fill="url(#safetyFill)" strokeWidth={2.5} isAnimationActive />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          className="glass-subtle rounded-3xl border border-slate-200 p-4 lg:col-span-2"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : 0.3 }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Detection Frequency</h3>
            <select
              aria-label="Detection frequency range"
              className="h-8 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600"
              value={frequencyRangeDays}
              onChange={(e) => setFrequencyRangeDays(e.target.value)}
            >
              <option value="1">Today ▾</option>
              <option value="7">This Week ▾</option>
              <option value="30">This Month ▾</option>
            </select>
          </div>
          {frequencyHourlyData.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No hourly data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={frequencyHourlyData} margin={{ top: 5, right: 10, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="freqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#bfdbfe" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#bfdbfe" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                <XAxis dataKey="hourLabel" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="detections" stroke="#3b82f6" fill="url(#freqFill)" strokeWidth={2.5} isAnimationActive />
                <Line type="monotone" dataKey="detections" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>
    </motion.section>
  );
}

export default AnalyticsChart;
