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
import { useSystemState, useSocketState } from '../../context/AlertContext.jsx';
import { normalizeServiceStatus } from '../../utils/statusHelpers';
import PremiumLoader from '../layout/PremiumLoader.jsx';

const ZONE_LINE_COLORS = ['#10b981', '#f59e0b', '#f43f5e', '#3b82f6', '#06b6d4', '#64748b'];

function AnalyticsChart() {
  const prefersReducedMotion = useReducedMotion();
  const { analyticsSnapshot, setAnalyticsSnapshot } = useDataCache();
  const { cameraStatuses, systemStatus } = useSystemState();
  const { socketConnected } = useSocketState();
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
    
    // Use real active cameras from system state, matching dashboard
    const cameraEntries = Object.values(cameraStatuses || {});
    const activeCameras = cameraEntries.filter(
      (cam) => normalizeServiceStatus(cam.status) === 'online'
    ).length;

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

    // Use real uptime logic, matching dashboard
    let uptimeVal = 0;
    const subsystems = systemStatus?.subsystems;
    if (!subsystems) {
      uptimeVal = socketConnected ? 99 : 0;
    } else {
      const deOnline = normalizeServiceStatus(subsystems.detection_engine?.status) === 'online';
      const apiOnline = socketConnected;
      if (deOnline && apiOnline) uptimeVal = 99;
      else if (deOnline || apiOnline) uptimeVal = 75;
    }

    return {
      totalAlerts,
      avgConfidence,
      systemUptime: `${uptimeVal}%`,
      activeCameras,
    };
  }, [zoneData, eventsData, normalizeConfidence, cameraStatuses, systemStatus, socketConnected]);

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
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-6 text-center" role="alert">
        <p className="text-[10px] font-mono tracking-widest uppercase text-rose-400">{error}</p>
        <button
          onClick={fetchSummary}
          className="mt-3 px-4 py-2 rounded text-[10px] font-mono font-bold tracking-widest uppercase bg-rose-500/20 text-rose-300 border border-rose-500/50 hover:bg-rose-500 hover:text-white transition-all shadow-[0_0_12px_rgba(244,63,94,0.3)]"
        >
          RETRY
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
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          {
            key: 'total',
            label: 'Total Alerts',
            value: kpis.totalAlerts,
            icon: (
              <svg className="h-5 w-5 text-rose-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            ),
            accent: '#f43f5e',
          },
          {
            key: 'confidence',
            label: 'Avg Confidence',
            value: `${kpis.avgConfidence.toFixed(1)}%`,
            icon: (
              <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4.5L9 5l6 14 1.5-7H21" />
              </svg>
            ),
            accent: '#3b82f6',
          },
          {
            key: 'uptime',
            label: 'System Uptime',
            value: kpis.systemUptime,
            icon: (
              <svg className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ),
            accent: '#10b981',
          },
          {
            key: 'cameras',
            label: 'Active Cameras',
            value: kpis.activeCameras,
            icon: (
              <svg className="h-5 w-5 text-cyan-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            ),
            accent: '#06b6d4',
          },
        ].map((card, idx) => (
          <motion.div
            key={card.key}
            className="relative overflow-hidden rounded border border-slate-800 bg-[#05080f] p-4 shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-shadow hover:shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
            initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, delay: prefersReducedMotion ? 0 : idx * 0.06 }}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 rounded-t" style={{ background: card.accent, boxShadow: `0 0 8px ${card.accent}80` }} />
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded border shrink-0"
                style={{ background: `${card.accent}18`, borderColor: `${card.accent}40` }}
              >
                {card.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                <p className="text-xl font-mono font-bold tracking-widest text-slate-200 mt-1">{card.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid min-h-[42rem] grid-cols-1 gap-3 lg:h-full lg:grid-cols-3 lg:grid-rows-2">
        <InteractiveBentoCard
          className="rounded border border-slate-800 bg-[#0a0f18] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:col-span-2 lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.15}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
              {isComparativeView ? 'COMPARATIVE TEMPORAL ANALYSIS' : 'INCIDENTS BY TIME OF DAY'}
            </h3>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded border border-slate-800 bg-slate-900 p-0.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                <button
                  type="button"
                  onClick={() => setIsComparativeView(false)}
                  className={`rounded px-2.5 py-1 text-[9px] font-mono tracking-widest uppercase transition-colors ${!isComparativeView ? 'bg-slate-800 text-slate-200 shadow-sm border border-slate-700' : 'text-slate-500 hover:text-slate-400 border border-transparent'}`}
                >
                  ALL
                </button>
                <button
                  type="button"
                  onClick={() => setIsComparativeView(true)}
                  className={`rounded px-2.5 py-1 text-[9px] font-mono tracking-widest uppercase transition-colors ${isComparativeView ? 'bg-slate-800 text-slate-200 shadow-sm border border-slate-700' : 'text-slate-500 hover:text-slate-400 border border-transparent'}`}
                >
                  BY ZONE
                </button>
              </div>
              <FilterDropdown
                ariaLabel="Incidents by time range"
                options={[
                  { value: '1', label: 'TODAY' },
                  { value: '7', label: 'THIS WEEK' },
                  { value: '30', label: 'THIS MONTH' },
                ]}
                value={lineRangeDays}
                onChange={setLineRangeDays}
              />
            </div>
          </div>
          {resolvedLineChart.data.length === 0 ? (
            <p className="text-slate-500 text-[10px] font-mono tracking-widest uppercase text-center py-8">NO HOURLY DATA AVAILABLE.</p>
          ) : (
            <div className="h-[280px] w-full overflow-hidden rounded sm:h-[300px] lg:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={shouldRenderMultiZoneLines ? lineMultiZone.data : resolvedLineChart.data}
                  margin={{ top: 6, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey={resolvedLineChart.xKey} tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<CustomTooltip multiSeries={shouldRenderMultiZoneLines} />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  {shouldRenderMultiZoneLines && (
                    <Legend
                      align="right"
                      verticalAlign="top"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingBottom: 8 }}
                      formatter={(value) => <span className="text-[10px] font-mono tracking-widest text-slate-500">{value}</span>}
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
          className="rounded border border-slate-800 bg-[#0a0f18] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.2}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">INCIDENTS BY ZONE</h3>
            <div className="flex items-center gap-2">
              <FilterDropdown
                ariaLabel="Zone scope filter"
                options={[
                  { value: 'all', label: 'ALL ZONES' },
                  { value: 'top5', label: 'TOP 5' },
                  { value: 'top8', label: 'TOP 8' },
                ]}
                value={zoneScope}
                onChange={setZoneScope}
              />
              <FilterDropdown
                ariaLabel="Incidents by zone time range"
                options={[
                  { value: '1', label: 'TODAY' },
                  { value: '7', label: 'THIS WK' },
                  { value: '30', label: 'THIS MO' },
                ]}
                value={zoneRangeDays}
                onChange={setZoneRangeDays}
              />
            </div>
          </div>
          {filteredZoneData.length === 0 ? (
            <p className="text-slate-500 text-[10px] font-mono tracking-widest uppercase text-center py-8">NO ZONE DATA AVAILABLE.</p>
          ) : (
            <div className="grid h-[280px] grid-cols-[1.15fr_1fr] gap-2 sm:h-[300px] lg:h-[260px]">
              <div
                className="overflow-hidden rounded transition-transform duration-300 ease-out hover:scale-[1.02]"
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
                        <Cell key={`${entry.zone}-${idx}`} fill={['#22d3ee', '#0ea5e9', '#3b82f6', '#0284c7'][idx % 4]} stroke="#0a0f18" strokeWidth={2} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-auto pr-1">
                <div className="space-y-1.5">
                  {filteredZoneData.map((entry, idx) => {
                    const color = ['#22d3ee', '#0ea5e9', '#3b82f6', '#0284c7'][idx % 4];
                    const percent = zoneTotalAlerts > 0
                      ? Math.round(((entry.alerts || 0) / zoneTotalAlerts) * 100)
                      : 0;
                    return (
                      <button
                        type="button"
                        key={`${entry.zoneId || entry.zone}-${idx}`}
                        onMouseEnter={() => setActiveZoneIndex(idx)}
                        onFocus={() => setActiveZoneIndex(idx)}
                        className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${activeZoneIndex === idx ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-[#05080f] hover:bg-slate-900'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
                            <span className="truncate text-[10px] font-mono tracking-wider text-slate-300 uppercase">{entry.zone}</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-cyan-400">{percent}%</span>
                        </div>
                        <p className="mt-0.5 text-[9px] font-mono tracking-[0.2em] uppercase text-slate-500">{entry.alerts || 0} INCIDENTS</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </InteractiveBentoCard>

        <InteractiveBentoCard
          className="rounded border border-slate-800 bg-[#0a0f18] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.35}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">TREND LIST</h3>
          </div>
          <div className="flex flex-col gap-4">
            {[
              { key: 'total', label: 'TOTAL ALERTS', subtext: 'LAST 7 DAYS', value: kpis.totalAlerts, trend: 'up', trendVal: '+12%' },
              { key: 'confidence', label: 'AVG CONFIDENCE', subtext: 'SYSTEM WIDE', value: `${kpis.avgConfidence.toFixed(1)}%`, trend: 'up', trendVal: '+2.1%' },
              { key: 'uptime', label: 'SYSTEM UPTIME', subtext: 'TRAILING 30D', value: kpis.systemUptime, trend: 'down', trendVal: '-0.5%' },
              { key: 'active', label: 'ACTIVE CAMERAS', subtext: 'CURRENTLY STREAMING', value: kpis.activeCameras, trend: 'neutral', trendVal: '0%' },
            ].map((item) => (
              <div key={item.key} className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-mono font-bold tracking-wider text-slate-300 uppercase">{item.label}</p>
                  <p className="text-[9px] font-mono tracking-[0.2em] text-slate-500 mt-0.5 uppercase">{item.subtext}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-mono font-bold text-slate-200">{item.value}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    {item.trend === 'up' && <svg className="w-3 h-3 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>}
                    {item.trend === 'down' && <svg className="w-3 h-3 text-rose-500 drop-shadow-[0_0_4px_rgba(244,63,94,0.8)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                    {item.trend === 'neutral' && <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" /></svg>}
                    <span className={`text-[9px] font-mono tracking-widest font-bold ${item.trend === 'up' ? 'text-emerald-400' : item.trend === 'down' ? 'text-rose-400' : 'text-slate-500'}`}>
                      {item.trendVal}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </InteractiveBentoCard>

        <InteractiveBentoCard
          className="rounded border border-slate-800 bg-[#0a0f18] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)] lg:col-span-2 lg:row-span-1 min-h-0"
          prefersReducedMotion={prefersReducedMotion}
          delay={0.3}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">DETECTION FREQUENCY</h3>
            <FilterDropdown
              ariaLabel="Detection frequency range"
              options={[
                { value: '1', label: 'TODAY' },
                { value: '7', label: 'THIS WEEK' },
                { value: '30', label: 'THIS MONTH' },
              ]}
              value={frequencyRangeDays}
              onChange={setFrequencyRangeDays}
            />
          </div>
          {resolvedFrequencyChart.data.length === 0 ? (
            <p className="text-slate-500 text-[10px] font-mono tracking-widest uppercase text-center py-8">NO HOURLY DATA AVAILABLE.</p>
          ) : (
            <div className="h-[280px] w-full overflow-hidden rounded sm:h-[300px] lg:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={resolvedFrequencyChart.data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="freqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey={resolvedFrequencyChart.xKey} tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'monospace' }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="detections" stroke="#22d3ee" fill="url(#freqFill)" strokeWidth={2.5} isAnimationActive />
                  <Line type="monotone" dataKey="detections" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive />
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
        className="inline-flex items-center gap-1 rounded bg-slate-900 px-3 py-1 text-[9px] font-mono tracking-widest uppercase text-slate-300 transition-colors border border-slate-700 hover:bg-slate-800 hover:text-slate-200"
        onClick={() => setOpen((prev) => !prev)}
      >
        {selected?.label}
        <svg className={`h-3 w-3 text-cyan-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
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
            className="absolute right-0 top-9 z-30 min-w-[150px] rounded border border-slate-700 bg-[#0a0f18]/95 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-xl"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[9px] font-mono tracking-widest uppercase transition-colors ${isSelected ? 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/50' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected && <span className="text-cyan-400 font-bold">✓</span>}
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
      className="rounded border border-slate-700 bg-[#0a0f18]/90 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-200 ease-out"
      style={{ transform }}
    >
      <p className="text-[9px] font-mono tracking-widest uppercase text-slate-500">{label || point?.payload?.zone || 'DATA'}</p>
      {multiSeries ? (
        <div className="mt-2 space-y-1.5">
          {entriesToRender.map((entry) => {
            const color = entry?.color || entry?.fill || '#22d3ee';
            const keyLabel = entry?.name || entry?.dataKey || 'ZONE';
            return (
              <div key={`${keyLabel}-${entry?.dataKey}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0 shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}80` }} />
                  <span className="text-[10px] font-mono tracking-wider text-slate-300 uppercase truncate">{keyLabel}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-200">{entry?.value ?? 0}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ backgroundColor: point?.color || point?.fill || '#22d3ee', boxShadow: `0 0 8px ${point?.color || point?.fill || '#22d3ee'}80` }} />
            <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">{point?.name || point?.dataKey || 'VALUE'}</span>
          </div>
          <p className="mt-1 text-[11px] font-mono font-bold text-cyan-400">{point?.value ?? '—'}</p>
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
          background: `radial-gradient(circle at ${cursor.x}% ${cursor.y}%, rgba(34,211,238,0.08) 0%, rgba(34,211,238,0.03) 18%, rgba(0,0,0,0) 62%)`,
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
