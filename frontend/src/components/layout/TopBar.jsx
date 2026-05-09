/**
 * AquaGuard — Top Bar (Modern Minimalist)
 *
 * Features:
 * - Clean glassmorphism header
 * - Real-time system status indicators
 * - User profile with clean design
 * - Semantic status colors
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  useAlertState,
  useSocketState,
  useSystemState,
} from '../../context/AlertContext.jsx';

function StatusIndicator({ label, connected, checking }) {
  const getStatusColor = () => {
    if (checking) return 'bg-slate-400';
    return connected ? 'bg-emerald-500' : 'bg-rose-500';
  };

  const getTextColor = () => {
    if (checking) return 'text-slate-500';
    return connected ? 'text-emerald-700' : 'text-rose-700';
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-900/50 border border-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <span className={`w-1.5 h-1.5 rounded-sm ${getStatusColor()} ${connected && !checking ? 'shadow-[0_0_8px_currentColor] animate-pulse' : ''}`} />
      <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-slate-500">
        {label}: <span className={getTextColor()}>
          {checking ? 'CHECKING' : connected ? 'ONLINE' : 'OFFLINE'}
        </span>
      </span>
    </div>
  );
}

function TopBar() {
  const { currentUser, logout, initializingSession } = useAuth();
  const { socketConnected } = useSocketState();
  const { systemStatus, apiStatus } = useSystemState();
  const navigate = useNavigate();
  
  const apiConnected = apiStatus?.connected;
  const apiChecking = initializingSession || apiConnected === null || apiConnected === undefined;
  
  const detectionFreshness = systemStatus?.subsystems?.detection_engine?.freshness_seconds;
  const detectionThreshold = systemStatus?.subsystems?.detection_engine?.stale_threshold_seconds;
  const detectionStale = (
    typeof detectionFreshness === 'number'
    && typeof detectionThreshold === 'number'
    && detectionFreshness > detectionThreshold
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="shrink-0 border-b border-slate-800 bg-[#05080f]/95 backdrop-blur-md shadow-sm">
      {/* Status bar */}
      <div
        className="px-6 py-2 border-b border-slate-800 bg-[#0a0f18] flex flex-wrap items-center gap-3"
        role="status"
        aria-live="polite"
      >
        <StatusIndicator 
          label="API" 
          connected={apiConnected} 
          checking={apiChecking} 
        />
        <StatusIndicator 
          label="SOCKET" 
          connected={socketConnected} 
          checking={false} 
        />
        <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-900/50 border border-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <span className={`w-1.5 h-1.5 rounded-sm ${detectionStale ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'}`} />
          <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-slate-500">
            DETECTION: <span className={detectionStale ? 'text-amber-500' : 'text-emerald-400'}>
              {typeof detectionFreshness === 'number' ? `${detectionFreshness}S AGO` : 'UNKNOWN'}
            </span>
          </span>
        </div>
        <span className="sr-only">Socket: {socketConnected ? 'Online' : 'Disconnected'}</span>
        <span className="sr-only">
          Detection freshness: {typeof detectionFreshness === 'number' ? `${detectionFreshness}s` : 'Unknown'}
        </span>
      </div>

      {/* Main bar */}
      <div className="h-16 flex items-center justify-between px-6">
        {/* Left: Page title */}
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 rounded bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
          <div>
            <h1 className="text-sm font-mono font-bold tracking-[0.2em] text-slate-200 uppercase">
              MONITORING DASHBOARD
            </h1>
            <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">REAL-TIME POOL SURVEILLANCE</p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-5">
          {/* User profile */}
          <div className="flex items-center gap-3 pl-5 border-l border-slate-800">
            <motion.div 
              className="w-10 h-10 rounded bg-slate-900 border border-slate-800 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
              whileHover={{ scale: 1.05 }}
            >
              <svg
                className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </motion.div>
            <div className="hidden sm:block">
              <p className="font-mono text-[11px] font-bold tracking-wider text-slate-200 uppercase leading-tight">
                {currentUser?.username || 'UNKNOWN'}
              </p>
              <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase leading-tight mt-0.5">
                {currentUser?.role || 'USER'}
              </p>
            </div>
          </div>

          {/* Logout button */}
          <motion.button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex items-center gap-2 px-4 py-2 rounded bg-slate-900/50 text-[10px] font-mono font-bold tracking-widest text-slate-400 border border-slate-800 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 hover:shadow-[0_0_12px_rgba(244,63,94,0.15)] transition-all duration-200 uppercase"
            title="Sign out"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
              />
            </svg>
            <span className="hidden sm:inline">DISCONNECT</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
