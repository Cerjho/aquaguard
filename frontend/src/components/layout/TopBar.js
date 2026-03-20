/**
 * AquaGuard — Top bar component.
 *
 * Displays:
 * - Page context / brand name
 * - Unacknowledged alert badge count
 * - Logged-in username and role
 * - Logout button
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAlerts } from '../../context/AlertContext';
import AlertBadge from '../alerts/AlertBadge';

function TopBar() {
  const { currentUser, logout } = useAuth();
  const { unacknowledgedCount, socketConnected, systemStatus, apiStatus } = useAlerts();
  const navigate = useNavigate();
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
    <header className="bg-white border-b border-slate-200 shrink-0 shadow-sm">
      <div
        className="px-6 py-1.5 text-xs border-b border-slate-100 flex flex-wrap items-center gap-3"
        role="status"
        aria-live="polite"
      >
        <span className={`font-semibold ${apiStatus?.connected ? 'text-green-700' : 'text-red-700'}`}>
          API: {apiStatus?.connected ? 'Online' : 'Offline'}
        </span>
        <span className={`font-semibold ${socketConnected ? 'text-green-700' : 'text-amber-700'}`}>
          Socket: {socketConnected ? 'Connected' : 'Disconnected'}
        </span>
        <span className={`font-semibold ${detectionStale ? 'text-amber-700' : 'text-green-700'}`}>
          Detection freshness: {typeof detectionFreshness === 'number' ? `${detectionFreshness}s` : 'unknown'}
        </span>
      </div>
      <div className="h-14 flex items-center justify-between px-6">
      {/* Left: title */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-700">
          Monitoring Dashboard
        </h1>
      </div>

      {/* Right: alert badge + user info + logout */}
      <div className="flex items-center gap-4">
        {/* Alert count badge */}
        <AlertBadge count={unacknowledgedCount} />

        {/* User info */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-sky-600"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-slate-700 leading-tight">
              {currentUser?.username || 'Unknown'}
            </p>
            <p className="text-xs text-slate-400 capitalize leading-tight">
              {currentUser?.role || ''}
            </p>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          aria-label="Logout"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors duration-150"
          title="Sign out"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Logout
        </button>
      </div>
      </div>
    </header>
  );
}

export default TopBar;
