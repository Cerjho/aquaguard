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
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${getStatusColor()} ${connected && !checking ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-slate-600">
        {label}: <span className={getTextColor()}>
          {checking ? 'Checking' : connected ? 'Online' : 'Offline'}
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
    <header className="shrink-0 border-b border-slate-200 glass-subtle">
      {/* Status bar */}
      <div
        className="px-6 py-2 border-b border-slate-200 flex flex-wrap items-center gap-6"
        role="status"
        aria-live="polite"
      >
        <StatusIndicator 
          label="API" 
          connected={apiConnected} 
          checking={apiChecking} 
        />
        <StatusIndicator 
          label="Socket" 
          connected={socketConnected} 
          checking={false} 
        />
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${detectionStale ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="text-xs text-slate-600">
            Detection: <span className={detectionStale ? 'text-amber-700' : 'text-emerald-700'}>
              {typeof detectionFreshness === 'number' ? `${detectionFreshness}s ago` : 'Unknown'}
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
          <div className="w-1 h-8 rounded-full bg-gradient-to-b from-blue-300 to-sky-400" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Monitoring Dashboard
            </h1>
            <p className="text-xs text-slate-600">Real-time pool surveillance</p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-5">
          {/* User profile */}
          <div className="flex items-center gap-3 pl-5 border-l border-slate-200">
            <motion.div 
              className="w-10 h-10 rounded-xl bg-[#f8fbff] border border-slate-200 flex items-center justify-center shadow-sm"
              whileHover={{ scale: 1.05 }}
            >
              <svg
                className="w-5 h-5 text-blue-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </motion.div>
            <div className="hidden sm:block">
              <p className="font-medium text-slate-900 text-sm leading-tight">
                {currentUser?.username || 'Unknown'}
              </p>
              <p className="text-xs text-slate-500 capitalize leading-tight">
                {currentUser?.role || 'User'}
              </p>
            </div>
          </div>

          {/* Logout button */}
          <motion.button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all duration-200"
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
            <span className="hidden sm:inline">Logout</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}

export default TopBar;
