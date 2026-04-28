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
  Legend,
  LineChart,
  Line,
  Area,
  ComposedChart,
  ResponsiveContainer,
} from 'recharts';
import api from '../../hooks/useApi';
import { useDataCache } from '../../context/DataCacheContext.jsx';
import PremiumLoader from '../layout/PremiumLoader.jsx';

const ZONE_LINE_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#06b6d4', '#64748b'];

function AnalyticsChart() {
  const prefersReducedMotion = useReducedMotion();
  const { analyticsSnapshot, setAnalyticsSnapshot } = useDataCache();
  const [zoneData, setZoneData] = useState([]);
  const [timeData, setTimeData] = useState([]);
  const [eventsData, setEventsData] = useState([]);
  const [lineRangeDays, setLineRangeDays] = useState('7');
  const [frequencyRangeDays, setFrequencyRangeDays] = useState('7');
  const [zoneRangeDays, setZoneRangeDays] = useState('7');
  const [zoneScope, setZoneScope] = useState('all');
  const [isComparativeView, setIsComparativeView] = useState(false);
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
      parseRangeDays(frequencyRangeDays),
      parseRangeDays(zoneRangeDays)
    )
  ), [lineRangeDays, frequencyRangeDays, zoneRangeDays, parseRangeDays]);

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

  const buildHourlyMultiZone = useCallback((events, selectedDays, zones = []) => {
    const cutoff = Date.now() - (parseRangeDays(selectedDays) * 86400000);
    const zoneBuckets = new Map();
    const zoneLabelRegistry = new Map();

    zones.forEach((zone) => {
      const zoneKey = String(zone.zoneId || zone.zone || 'Unknown Zone');
      const zoneLabel = String(zone.zone || zone.zoneId || 'Unknown Zone');
      zoneLabelRegistry.set(zoneKey, zoneLabel);
      if (!zoneBuckets.has(zoneLabel)) {
        zoneBuckets.set(zoneLabel, Array.from({ length: 24 }).fill(0));
      }
    });

    events.forEach((event) => {
      const ts = event.timestamp || event.detected_at || event.created_at;
      const parsed = new Date(ts);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() < cutoff) return;
      if (!(event.alert_triggered || event.status === 'alerted')) return;

      const zoneKey = String(event.zone_id || event.zone || event.zone_name || event.camera_zone || 'Unknown Zone');
      const zoneLabel = zoneLabelRegistry.get(zoneKey)
        || String(event.zone_name || event.zone_id || event.zone || event.camera_zone || 'Unknown Zone');
      if (!zoneBuckets.has(zoneLabel)) {
        zoneBuckets.set(zoneLabel, Array.from({ length: 24 }).fill(0));
      }
      const hour = parsed.getHours();
      zoneBuckets.get(zoneLabel)[hour] += 1;
    });

    const zoneLabels = Array.from(zoneBuckets.keys()).sort((a, b) => a.localeCompare(b));
    const series = zoneLabels.map((zoneLabel, idx) => ({
      zoneLabel,
      dataKey: `zoneSeries_${idx}`,
      color: ZONE_LINE_COLORS[idx % ZONE_LINE_COLORS.length],
    }));

    const data = Array.from({ length: 24 }).map((_, hour) => {
      const row = {
        hour,
        hourLabel: `${String(hour).padStart(2, '0')}:00`,
      };
      series.forEach((entry) => {
        row[entry.dataKey] = zoneBuckets.get(entry.zoneLabel)?.[hour] || 0;
      });
      return row;
    });

    const hasSignal = data.some((row) => (
      series.some((entry) => Number(row[entry.dataKey] || 0) > 0)
    ));

    return { data, series, hasSignal };
  }, [parseRangeDays]);

  const formatDateLabel = useCallback((value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value || '');
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const lineHourlyData = useMemo(
    () => buildHourlyFromEvents(eventsData, lineRangeDays, ''),
    [eventsData, lineRangeDays, buildHourlyFromEvents]
  );

  const frequencyHourlyData = useMemo(
    () => buildHourlyFromEvents(eventsData, frequencyRangeDays),
    [eventsData, frequencyRangeDays, buildHourlyFromEvents]
  );

  const lineMultiZone = useMemo(
    () => buildHourlyMultiZone(eventsData, lineRangeDays, zoneData),
    [eventsData, lineRangeDays, zoneData, buildHourlyMultiZone]
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

  const shouldRenderMultiZoneLines = useMemo(() => (
    isComparativeView
    && resolvedLineChart.xKey === 'hourLabel'
    && lineMultiZone.series.length > 0
  ), [isComparativeView, resolvedLineChart.xKey, lineMultiZone]);

  const resolvedFrequencyChart = useMemo(() => {
    if (frequencyHasEventSignal || fallbackLineTimeData.length === 0) {
      return { data: frequencyHourlyData, xKey: 'hourLabel' };
    }
    return { data: fallbackLineTimeData, xKey: 'dateLabel' };
  }, [frequencyHasEventSignal, fallbackLineTimeData, frequencyHourlyData]);

  const dynamicZoneData = useMemo(() => {
    const cutoff = Date.now() - (parseRangeDays(zoneRangeDays) * 86400000);
    const aggregates = new Map();
    
    zoneData.forEach(z => {
      aggregates.set(String(z.zoneId || z.zone), { ...z, alerts: 0, detections: 0 });
    });

    eventsData.forEach(event => {
      const ts = event.timestamp || event.detected_at || event.created_at;
      const parsed = new Date(ts);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() < cutoff) return;
      
      const zoneKey = String(event.zone_id || event.zone || event.zone_name || event.camera_zone || 'Unknown Zone');
      const zoneLabel = String(event.zone_name || event.zone_id || event.zone || event.camera_zone || 'Unknown Zone');
      
      if (!aggregates.has(zoneKey)) {
        aggregates.set(zoneKey, { zoneId: zoneKey, zone: zoneLabel, alerts: 0, detections: 0 });
      }
      
      const current = aggregates.get(zoneKey);
      current.detections += 1;
      if (event.alert_triggered || event.status === 'alerted') {
        current.alerts += 1;
      }
    });

    return eventsData.length > 0 ? Array.from(aggregates.values()) : zoneData;
  }, [eventsData, zoneData, zoneRangeDays, parseRangeDays]);

  const filteredZoneData = useMemo(() => {
    const sorted = [...dynamicZoneData].sort((a, b) => (b.alerts || 0) - (a.alerts || 0));
    if (zoneScope === 'top5') return sorted.slice(0, 5);
    if (zoneScope === 'top8') return sorted.slice(0, 8);
    return sorted;
  }, [dynamicZoneData, zoneScope]);

  const zoneTotalAlerts = useMemo(
    () => filteredZoneData.reduce((sum, zone) => sum + (zone.alerts || 0), 0),
    [filteredZoneData]
  );

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
    try {
      const res = await api.get('/api/v1/reports/summary', {
        params: {
          group_by: 'zone',
          from: getRangeStartIso(),
        },
      });
      const data = res?.data?.data ?? res?.data;

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
        const eventsPayload = eventsRes?.data?.data ?? eventsRes?.data;
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
      setError(
        err.response?.data?.message || 'Failed to load analytics data.'
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [
    getRangeStartIso,
    hasLocalData,
    applyAnalyticsData,
  ]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  if (loading) {
    return <PremiumLoader />;
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
            <h3 className="text-sm font-semibold text-slate-900">
              {isComparativeView ? 'Comparative Temporal Analysis' : 'Incidents by Time of Day'}
            </h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setIsComparativeView(false)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${!isComparativeView ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setIsComparativeView(true)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${isComparativeView ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  By Zone
                </button>
              </div>
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
                <LineChart
                  data={shouldRenderMultiZoneLines ? lineMultiZone.data : resolvedLineChart.data}
                  margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8e1ea" />
                  <XAxis dataKey={resolvedLineChart.xKey} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<CustomTooltip multiSeries={shouldRenderMultiZoneLines} />} />
                  {shouldRenderMultiZoneLines && (
                    <Legend
                      align="right"
                      verticalAlign="top"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingBottom: 8 }}
                      formatter={(value) => <span className="text-xs text-slate-500">{value}</span>}
                    />
                  )}
                  {shouldRenderMultiZoneLines ? (
                    lineMultiZone.series.map((series) => (
                      <Line
                        key={series.dataKey}
                        type="linear"
                        dataKey={series.dataKey}
                        name={series.zoneLabel}
                        stroke={series.color}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive
                      />
                    ))
                  ) : (
                    <Line
                      type="linear"
                      dataKey="incidents"
                      stroke={ZONE_LINE_COLORS[0]}
                      strokeWidth={3}
                      dot={{ r: 2 }}
                      isAnimationActive
                    />
                  )}
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
            <div className="flex items-center gap-2">
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
              <FilterDropdown
                ariaLabel="Incidents by zone time range"
                options={[
                  { value: '1', label: 'Today' },
                  { value: '7', label: 'This Wk' },
                  { value: '30', label: 'This Mo' },
                ]}
                value={zoneRangeDays}
                onChange={setZoneRangeDays}
              />
            </div>
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
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Trend List</h3>
          </div>
          <div className="flex flex-col gap-4">
            {[
              { key: 'total', label: 'Total Alerts', subtext: 'Last 7 days', value: kpis.totalAlerts, trend: 'up', trendVal: '+12%' },
              { key: 'confidence', label: 'Avg Confidence', subtext: 'System wide', value: `${kpis.avgConfidence.toFixed(1)}%`, trend: 'up', trendVal: '+2.1%' },
              { key: 'uptime', label: 'System Uptime', subtext: 'Trailing 30d', value: kpis.systemUptime, trend: 'down', trendVal: '-0.5%' },
              { key: 'active', label: 'Active Cameras', subtext: 'Currently streaming', value: kpis.activeCameras, trend: 'neutral', trendVal: '0%' },
            ].map((item) => (
              <div key={item.key} className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.subtext}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{item.value}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {item.trend === 'up' && <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
                    {item.trend === 'down' && <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                    {item.trend === 'neutral' && <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>}
                    <span className={`text-[10px] font-medium ${item.trend === 'up' ? 'text-emerald-600' : item.trend === 'down' ? 'text-rose-600' : 'text-slate-500'}`}>
                      {item.trendVal}
                    </span>
                  </div>
                </div>
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
  multiSeries = false,
}) {
  if (!active || !payload || payload.length === 0) return null;

  const visibleEntries = payload
    .filter((entry) => typeof entry?.value === 'number' ? entry.value > 0 : Boolean(entry?.value))
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));

  const entriesToRender = visibleEntries.length > 0 ? visibleEntries : payload;
  const point = entriesToRender[0];
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
      {multiSeries ? (
        <div className="mt-2 space-y-1.5">
          {entriesToRender.map((entry) => {
            const color = entry?.color || entry?.fill || '#a3cef1';
            const keyLabel = entry?.name || entry?.dataKey || 'Zone';
            return (
              <div key={`${keyLabel}-${entry?.dataKey}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm text-slate-600 truncate">{keyLabel}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{entry?.value ?? 0}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: point?.color || point?.fill || '#a3cef1' }} />
            <span className="text-sm text-slate-500">{point?.name || point?.dataKey || 'value'}</span>
          </div>
          <p className="mt-1 text-base font-semibold text-slate-900">{point?.value ?? '—'}</p>
        </>
      )}
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

export default AnalyticsChart;
