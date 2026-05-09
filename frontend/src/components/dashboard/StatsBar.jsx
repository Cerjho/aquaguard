/**
 * AquaGuard — StatsBar component
 *
 * Animated KPI strip for the dashboard hero area.
 * Shows: Active Cameras, Detections (24h), Active Alerts, System Uptime.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSystemState, useAlertState, useSocketState } from '../../context/AlertContext.jsx';
import { normalizeServiceStatus } from '../../utils/statusHelpers';

/* ── Animated counter ─────────────────────────────────────────────────── */
function AnimatedNumber({ value, duration = 1.2, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const prefersReducedMotion = useReducedMotion();
  const rafRef = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion || typeof value !== 'number') {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;
    const to = value;

    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, prefersReducedMotion]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

/* ── Stat Card ────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, suffix, accent, glowing, delay }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={`relative overflow-hidden rounded-lg border bg-slate-900 p-4 sm:p-5 shadow-sm transition-shadow duration-300 hover:shadow-md ${
        glowing
          ? 'border-rose-500 shadow-rose-500/20 bg-rose-950/20'
          : 'border-slate-800'
      }`}
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.4, delay: prefersReducedMotion ? 0 : delay }}
    >
      {/* Subtle gradient accent stripe at top */}
      <div
        className="absolute inset-x-0 top-0 h-1 rounded-t-2xl"
        style={{ background: accent }}
      />

      <div className="flex items-center gap-3">
        {/* Icon container */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
          style={{ background: `${accent}18` }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="text-2xl font-mono font-bold tracking-tight text-white leading-tight">
            <AnimatedNumber value={typeof value === 'number' ? value : 0} suffix={suffix || ''} />
          </p>
        </div>
      </div>

      {/* Pulsing glow for active alerts */}
      {glowing && (
        <div className="absolute inset-0 rounded-lg animate-pulse-glow pointer-events-none border border-rose-500/50" />
      )}
    </motion.div>
  );
}

/* ── Main StatsBar ────────────────────────────────────────────────────── */
function StatsBar() {
  const { cameraStatuses, systemStatus } = useSystemState();
  const { activeAlerts, detectionEvents } = useAlertState();
  const { socketConnected } = useSocketState();

  const cameraEntries = Object.values(cameraStatuses || {});
  const onlineCameras = cameraEntries.filter(
    (cam) => normalizeServiceStatus(cam.status) === 'online'
  ).length;

  const alertCount = (activeAlerts || []).length;

  // Detection count: use recent events as proxy
  const detectionCount = useMemo(() => {
    if (detectionEvents.length > 0) return detectionEvents.length;
    if (typeof systemStatus?.detection_count === 'number') return systemStatus.detection_count;
    return 0;
  }, [detectionEvents, systemStatus]);

  // Uptime estimate
  const uptimePercent = useMemo(() => {
    const subsystems = systemStatus?.subsystems;
    if (!subsystems) return socketConnected ? 99 : 0;
    const deOnline = normalizeServiceStatus(subsystems.detection_engine?.status) === 'online';
    const apiOnline = socketConnected;
    if (deOnline && apiOnline) return 99;
    if (deOnline || apiOnline) return 75;
    return 0;
  }, [systemStatus, socketConnected]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <StatCard
        icon={
          <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
        }
        label="Active Cameras"
        value={onlineCameras}
        suffix={` / ${cameraEntries.length}`}
        accent="#3b82f6"
        delay={0.05}
      />

      <StatCard
        icon={
          <svg className="h-5 w-5 text-cyan-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4.5L9 5l6 14 1.5-7H21" />
          </svg>
        }
        label="Detections"
        value={detectionCount}
        accent="#06b6d4"
        delay={0.1}
      />

      <StatCard
        icon={
          <svg className="h-5 w-5 text-rose-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        }
        label="Active Alerts"
        value={alertCount}
        accent="#f43f5e"
        glowing={alertCount > 0}
        delay={0.15}
      />

      <StatCard
        icon={
          <svg className="h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        label="System Uptime"
        value={uptimePercent}
        suffix="%"
        accent="#10b981"
        delay={0.2}
      />
    </div>
  );
}

export default StatsBar;
