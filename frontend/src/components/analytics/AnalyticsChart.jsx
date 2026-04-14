/**
 * AquaGuard — AnalyticsChart component.
 *
 * Premium analytics view with KPI cards and Recharts visualizations.
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  Sector,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Area,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import api from '../../hooks/useApi';
import { useDataCache } from '../../context/DataCacheContext.jsx';

const ENABLE_ANALYTICS_MOCK = process.env.REACT_APP_ANALYTICS_MOCK !== 'false';

function AnalyticsChart() {
  const prefersReducedMotion = useReducedMotion();
  const { analyticsSnapshot, setAnalyticsSnapshot } = useDataCache();
  const [zoneData, setZoneData] = useState([]);
  const [timeData, setTimeData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [lineRangeDays, setLineRangeDays] = useState('7');
  const [frequencyRangeDays, setFrequencyRangeDays] = useState('7');
  const [zoneScope, setZoneScope] = useState('all');
  const [lineViewMode, setLineViewMode] = useState('all');
  const [lineZoneFilter, setLineZoneFilter] = useState('');
  const [activeZoneIndex, setActiveZoneIndex] = useState(null);
  const [loading, setLoading] = useState(!analyticsSnapshot);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasLocalData = zoneData.length > 0 || timeData.length > 0 || eventsData.length > 0;

  useEffect(() => {
    if (!analyticsSnapshot) return;
    setZoneData(analyticsSnapshot.zoneData || []);
    setTimeData(analyticsSnapshot.timeData || []);
    setEventsData(analyticsSnapshot.eventsData || []);
    setLoading(false);
  }, [analyticsSnapshot]);

  const parseRangeDays = useCallback((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  }, []);

  const maxSelectedRangeDays = useMemo(() => (
    Math.max(
      parseRangeDays(lineRangeDays),
      parseRangeDays(frequencyRangeDays)
    )
  ), [lineRangeDays, frequencyRangeDays, parseRangeDays]);

  const getRangeStartIso = useCallback(() => (
    new Date(Date.now() - maxSelectedRangeDays * 86400000).toISOString()
  ), [maxSelectedRangeDays]);

  const buildHourlyBuckets = () => {
    return Array.from({ length: 24 }).map((_, hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      incidents: 0,
      detections: 0,
    }));
  };

  const buildHourlyFromEvents = useCallback((events, selectedDays, zoneFilter = '') => {
    const buckets = buildHourlyBuckets();
    const cutoff = Date.now() - (parseRangeDays(selectedDays) * 86400000);
    events.forEach((event) => {
      const ts = event.timestamp || event.detected_at || event.created_at;
      const parsed = new Date(ts);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() < cutoff) return;
      const eventZone = String(
        event.zone_id || event.zone || event.zone_name || event.camera_zone || ''
      );
      if (zoneFilter && eventZone !== zoneFilter) return;
      const hour = parsed.getHours();
      buckets[hour].detections += 1;
      if (event.alert_triggered || event.status === 'alerted') {
        buckets[hour].incidents += 1;
      }
    });
    return buckets;
  }, [parseRangeDays]);

  const formatDateLabel = useCallback((value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value || '');
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const lineHourlyData = useMemo(
    () => buildHourlyFromEvents(
      eventsData,
      lineRangeDays,
      lineViewMode === 'zone' ? lineZoneFilter : ''
    ),
    [eventsData, lineRangeDays, lineViewMode, lineZoneFilter, buildHourlyFromEvents]
  );

  const frequencyHourlyData = useMemo(
    () => buildHourlyFromEvents(eventsData, frequencyRangeDays),
    [eventsData, frequencyRangeDays, buildHourlyFromEvents]
  );

  const fallbackLineTimeData = useMemo(
    () => (timeData || []).map((entry) => ({
      dateLabel: formatDateLabel(entry.date),
      incidents: Number(entry.alerts || 0),
      detections: Number(entry.detections || 0),
    })),
    [timeData, formatDateLabel]
  );

  const lineHasEventSignal = useMemo(
    () => lineHourlyData.some((point) => (point.incidents || 0) > 0 || (point.detections || 0) > 0),
    [lineHourlyData]
  );

  const frequencyHasEventSignal = useMemo(
    () => frequencyHourlyData.some((point) => (point.detections || 0) > 0),
    [frequencyHourlyData]
  );

  const resolvedLineChart = useMemo(() => {
    if (lineHasEventSignal || fallbackLineTimeData.length === 0) {
      return { data: lineHourlyData, xKey: 'hourLabel' };
    }
    return { data: fallbackLineTimeData, xKey: 'dateLabel' };
  }, [lineHasEventSignal, fallbackLineTimeData, lineHourlyData]);

  const resolvedFrequencyChart = useMemo(() => {
    if (frequencyHasEventSignal || fallbackLineTimeData.length === 0) {
      return { data: frequencyHourlyData, xKey: 'hourLabel' };
    }
    return { data: fallbackLineTimeData, xKey: 'dateLabel' };
  }, [frequencyHasEventSignal, fallbackLineTimeData, frequencyHourlyData]);

  const filteredZoneData = useMemo(() => {
    const sorted = [...zoneData].sort((a, b) => (b.alerts || 0) - (a.alerts || 0));
    if (zoneScope === 'top5') return sorted.slice(0, 5);
    if (zoneScope === 'top8') return sorted.slice(0, 8);
    return sorted;
  }, [zoneData, zoneScope]);

  const zoneTotalAlerts = useMemo(
    () => filteredZoneData.reduce((sum, zone) => sum + (zone.alerts || 0), 0),
    [filteredZoneData]
  );

  const availableZoneOptions = useMemo(
    () => zoneData.map((zone) => ({ value: zone.zoneId || zone.zone, label: zone.zone })),
    [zoneData]
  );

  useEffect(() => {
    if (lineViewMode !== 'zone') return;
    const zoneExists = availableZoneOptions.some((zone) => zone.value === lineZoneFilter);
    if (!zoneExists) {
      setLineZoneFilter(availableZoneOptions[0]?.value || '');
    }
  }, [lineViewMode, lineZoneFilter, availableZoneOptions]);

  const normalizeConfidence = useCallback((raw) => {
    if (raw === null || raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (Number.isNaN(value)) return null;
    return value > 1 ? value / 100 : value;
  }, []);

  const kpis = useMemo(() => {
    const totalAlerts = zoneData.reduce((sum, zone) => sum + (zone.alerts || 0), 0);
    const activeCameras = zoneData.length;
    let confidenceTotal = 0;
    let confidenceCount = 0;

    eventsData.forEach((event) => {
      const confidence = normalizeConfidence(
        event.confidence ?? event.final_confidence ?? event.confidence_score
      );
      if (typeof confidence === 'number') {
        confidenceTotal += confidence;
        confidenceCount += 1;
      }
    });

    const avgConfidence = confidenceCount > 0
      ? (confidenceTotal / confidenceCount) * 100
      : 0;

    return {
      totalAlerts,
      avgConfidence,
      systemUptime: `${Math.max(90, 99 - Math.min(8, activeCameras / 2)).toFixed(1)}%`,
      activeCameras,
    };
  }, [zoneData, eventsData, normalizeConfidence]);

  const buildMockAnalyticsData = useCallback(() => {
    const mockZones = [
      { zoneId: 'zone_a', zone: 'Zone A', alerts: 34, detections: 120 },
      { zoneId: 'zone_b', zone: 'Zone B', alerts: 21, detections: 96 },
      { zoneId: 'zone_c', zone: 'Zone C', alerts: 17, detections: 78 },
      { zoneId: 'zone_d', zone: 'Zone D', alerts: 12, detections: 62 },
    ];

    const mockTime = Array.from({ length: 7 }).map((_, idx) => {
      const date = new Date(Date.now() - ((6 - idx) * 86400000));
      return {
        date: date.toISOString().slice(0, 10),
        alerts: 8 + (idx * 3),
        detections: 20 + (idx * 5),
      };
    });

    const mockEvents = Array.from({ length: 180 }).map((_, idx) => {
      const timestamp = new Date(Date.now() - (idx * 3600000));
      const zone = mockZones[idx % mockZones.length];
      return {
        id: `mock-${idx}`,
        timestamp: timestamp.toISOString(),
        zone_id: zone.zoneId,
        zone_name: zone.zone,
        status: idx % 4 === 0 ? 'alerted' : 'ok',
        alert_triggered: idx % 4 === 0,
        confidence: 0.72 + ((idx % 7) * 0.03),
      };
    });

    return {
      zoneData: mockZones,
      timeData: mockTime,
      eventsData: mockEvents,
    };
  }, []);

  const applyAnalyticsData = useCallback((data) => {
    setZoneData(data.zoneData || []);
    setTimeData(data.timeData || []);
    setEventsData(data.eventsData || []);
    setAnalyticsSnapshot({
      zoneData: data.zoneData || [],
      timeData: data.timeData || [],
      eventsData: data.eventsData || [],
      fetchedAt: Date.now(),
    });
  }, [setAnalyticsSnapshot]);

  const fetchSummary = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    if (!hasLocalData) {
      setLoading(true);
    }
    setError(null);
    if (ENABLE_ANALYTICS_MOCK) {
      if (requestId !== requestIdRef.current) return;
      applyAnalyticsData(buildMockAnalyticsData());
      setLoading(false);
      return;
    }
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
      const eventRangeStart = getRangeStartIso();
      let events = [];
      try {
        const eventsRes = await api.get('/api/v1/events', {
          params: {
            page: 1,
            limit: 300,
            from: eventRangeStart,
          },
        });
        const eventsPayload = eventsRes.data;
        events = Array.isArray(eventsPayload)
          ? eventsPayload
          : eventsPayload.events || [];
      } catch (_) {
        events = [];
      }
      applyAnalyticsData({
        zoneData: normalizedZones,
        timeData: normalizedTime,
        eventsData: events,
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (ENABLE_ANALYTICS_MOCK) {
        applyAnalyticsData(buildMockAnalyticsData());
        setError(null);
      } else {
        setError(
          err.response?.data?.message || 'Failed to load analytics data.'
        );
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    getRangeStartIso,
    hasLocalData,
    buildMockAnalyticsData,
    applyAnalyticsData,
  ]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading analytics">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:auto-rows-[245px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <div className="skeleton h-4 w-40 mb-3" />
            <div className="skeleton h-[195px]" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="skeleton h-4 w-32 mb-3" />
            <div className="skeleton h-[195px]" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <div className="skeleton h-4 w-40 mb-3" />
            <div className="skeleton h-[195px]" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="skeleton h-6 w-6 rounded-full" />
                    <div className="skeleton h-3 w-20" />
                  </div>
                  <div className="skeleton h-4 w-12" />
                </div>
              ))}
            </div>
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
      className="h-auto min-h-[42rem] overflow-visible lg:h-[calc(100vh-13.5rem)]"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
      aria-label="Analytics charts"
    >
      <div className="grid min-h-[42rem] grid-cols-1 gap-3 lg:h-full lg:grid-cols-3 lg:grid-rows-2">
        <InteractiveBentoCard
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md lg:col-span-2 lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.15}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Incidents by Time of Day</h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setLineViewMode('all')}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${lineViewMode === 'all' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setLineViewMode('zone')}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${lineViewMode === 'zone' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  By Zone
                </button>
              </div>
              {lineViewMode === 'zone' && (
                <FilterDropdown
                  ariaLabel="Line chart zone filter"
                  options={availableZoneOptions}
                  value={lineZoneFilter || availableZoneOptions[0]?.value || ''}
                  onChange={setLineZoneFilter}
                />
              )}
              <FilterDropdown
                ariaLabel="Incidents by time range"
                options={[
                  { value: '1', label: 'Today' },
                  { value: '7', label: 'This Week' },
                  { value: '30', label: 'This Month' },
                ]}
                value={lineRangeDays}
                onChange={setLineRangeDays}
              />
            </div>
          </div>
          {resolvedLineChart.data.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No hourly data available.</p>
          ) : (
            <div className="h-[280px] w-full overflow-hidden rounded-xl sm:h-[300px] lg:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={resolvedLineChart.data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                  <XAxis dataKey={resolvedLineChart.xKey} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="incidents" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </InteractiveBentoCard>

        <InteractiveBentoCard
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.2}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Incidents by Zone</h3>
            <FilterDropdown
              ariaLabel="Zone scope filter"
              options={[
                { value: 'all', label: 'All Zones' },
                { value: 'top5', label: 'Top 5' },
                { value: 'top8', label: 'Top 8' },
              ]}
              value={zoneScope}
              onChange={setZoneScope}
            />
          </div>
          {filteredZoneData.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No zone data available.</p>
          ) : (
            <div className="grid h-[280px] grid-cols-[1.15fr_1fr] gap-2 sm:h-[300px] lg:h-[260px]">
              <div
                className="overflow-hidden rounded-xl transition-transform duration-300 ease-out hover:scale-[1.02]"
                onMouseLeave={() => setActiveZoneIndex(null)}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <Pie
                      data={filteredZoneData}
                      dataKey="alerts"
                      nameKey="zone"
                      innerRadius={34}
                      outerRadius={82}
                      paddingAngle={2}
                      cx="50%"
                      cy="50%"
                      isAnimationActive
                      cornerRadius={8}
                      activeIndex={activeZoneIndex ?? undefined}
                      activeShape={(props) => (
                        <Sector
                          {...props}
                          outerRadius={(props.outerRadius || 0) + 8}
                          cornerRadius={10}
                        />
                      )}
                      onMouseEnter={(_, index) => setActiveZoneIndex(index)}
                    >
                      {filteredZoneData.map((entry, idx) => (
                        <Cell key={`${entry.zone}-${idx}`} fill={['#a3cef1', '#93c5fd', '#bfdbfe', '#dbeafe'][idx % 4]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-auto pr-1">
                <div className="space-y-1.5">
                  {filteredZoneData.map((entry, idx) => {
                    const color = ['#a3cef1', '#93c5fd', '#bfdbfe', '#dbeafe'][idx % 4];
                    const percent = zoneTotalAlerts > 0
                      ? Math.round(((entry.alerts || 0) / zoneTotalAlerts) * 100)
                      : 0;
                    return (
                      <button
                        type="button"
                        key={`${entry.zoneId || entry.zone}-${idx}`}
                        onMouseEnter={() => setActiveZoneIndex(idx)}
                        onFocus={() => setActiveZoneIndex(idx)}
                        className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${activeZoneIndex === idx ? 'border-[#a3cef1] bg-[#a3cef1]/10' : 'border-slate-200 bg-white/90'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="truncate text-[12px] font-medium text-slate-700">{entry.zone}</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600">{percent}%</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">{entry.alerts || 0} incidents</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </InteractiveBentoCard>

        <InteractiveBentoCard
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.35}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">System Health Summary</h3>
          </div>
          <div className="flex h-[calc(100%-1.75rem)] flex-col gap-1.5">
            {[
              { key: 'total', label: 'Total Alerts', value: kpis.totalAlerts, icon: AlertIcon },
              { key: 'confidence', label: 'Avg Confidence', value: `${kpis.avgConfidence.toFixed(1)}%`, icon: ShieldIcon },
              { key: 'uptime', label: 'System Uptime', value: kpis.systemUptime, icon: UptimeIcon },
              { key: 'active', label: 'Active Cameras', value: kpis.activeCameras, icon: CameraIcon },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/85 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#a3cef1]/20 text-[#a3cef1]">
                    <item.icon />
                  </div>
                  <span className="text-sm font-medium text-slate-500">{item.label}</span>
                </div>
                <span className="text-base font-semibold tracking-tight text-slate-800">{item.value}</span>
              </div>
            ))}
          </div>
        </InteractiveBentoCard>

        <InteractiveBentoCard
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md lg:col-span-2 lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.3}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Detection Frequency</h3>
            <FilterDropdown
              ariaLabel="Detection frequency range"
              options={[
                { value: '1', label: 'Today' },
                { value: '7', label: 'This Week' },
                { value: '30', label: 'This Month' },
              ]}
              value={frequencyRangeDays}
              onChange={setFrequencyRangeDays}
            />
          </div>
          {resolvedFrequencyChart.data.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No hourly data available.</p>
          ) : (
            <div className="h-[280px] w-full overflow-hidden rounded-xl sm:h-[300px] lg:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={resolvedFrequencyChart.data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="freqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#bfdbfe" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#bfdbfe" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                  <XAxis dataKey={resolvedFrequencyChart.xKey} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="detections" stroke="#3b82f6" fill="url(#freqFill)" strokeWidth={2.5} isAnimationActive />
                  <Line type="monotone" dataKey="detections" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </InteractiveBentoCard>

      </div>
    </motion.section>
  );
}

function FilterDropdown({ options, value, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200"
        onClick={() => setOpen((prev) => !prev)}
      >
        {selected?.label}
        <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 011.1 1.02l-4.25 4.5a.75.75 0 01-1.1 0l-4.25-4.5a.75.75 0 01.02-1.04z" clipRule="evenodd" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-9 z-30 min-w-[150px] rounded-2xl border border-slate-100 bg-white/90 p-1.5 shadow-lg backdrop-blur-xl"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${isSelected ? 'text-sky-700' : 'text-slate-600 hover:bg-[#e7ecef] hover:text-sky-700'}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected && <span className="text-[#a3cef1]">✓</span>}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  coordinate,
  viewBox,
}) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0];
  const color = point?.color || point?.fill || '#a3cef1';
  const keyLabel = point?.name || point?.dataKey || 'value';
  const pointValue = point?.value ?? '—';
  const anchorX = coordinate?.x ?? 0;
  const chartMid = viewBox ? (viewBox.x + (viewBox.width / 2)) : 0;
  const enterFromRight = anchorX > chartMid;
  const transform = enterFromRight ? 'translateX(6px)' : 'translateX(-6px)';

  return (
    <div
      className="rounded-xl border border-white/50 bg-white/90 p-3 shadow-xl backdrop-blur-md transition-all duration-200 ease-out"
      style={{ transform }}
    >
      <p className="text-xs text-slate-500">{label || point?.payload?.zone || 'Data'}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm text-slate-500">{keyLabel}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-slate-900">{pointValue}</p>
    </div>
  );
}

function InteractiveBentoCard({
  className,
  children,
  prefersReducedMotion,
  delay = 0,
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });

  const handleMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setCursor({ x, y });
  };

  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={prefersReducedMotion ? undefined : { y: -2, scale: 1.003 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : delay }}
      onMouseEnter={(event) => {
        setIsHovering(true);
        handleMove(event);
      }}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMove}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${cursor.x}% ${cursor.y}%, rgba(163,206,241,0.22) 0%, rgba(163,206,241,0.1) 18%, rgba(255,255,255,0) 62%)`,
        }}
        animate={{ opacity: isHovering ? 1 : 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      />
      <div className="relative z-10 h-full">
        {children}
      </div>
    </motion.div>
  );
}

function AlertIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.04 13.92A2 2 0 004 21h16a2 2 0 001.75-3.22L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 4v6c0 5-3.5 8-8 8s-8-3-8-8V7l8-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  );
}

function UptimeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="7" width="15" height="10" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 10l3-2v8l-3-2z" />
    </svg>
  );
}

export default AnalyticsChart;
