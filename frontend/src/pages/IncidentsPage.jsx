/**
 * AquaGuard — Incidents Page.
 */

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import AlertHistory from '../components/alerts/AlertHistory.jsx';
import IncidentHistory from '../components/events/IncidentHistory.jsx';

const TABS = [
  { id: 'alerts', label: 'Alert History', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  )},
  { id: 'events', label: 'Detection Events', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
    </svg>
  )},
];

function IncidentsPage() {
  const [activeTab, setActiveTab] = useState('alerts');
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div 
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
    >
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-300 to-sky-400" />
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Incidents</h2>
          <p className="text-sm text-slate-600 mt-1">
            Historical alerts and detection events
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="glass-subtle p-1.5 flex gap-2 w-fit rounded-2xl border border-slate-200" role="tablist" aria-label="Incident views">
        {TABS.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-label={`Open ${tab.label}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            id={`incident-tab-${tab.id}`}
            aria-controls={`incident-panel-${tab.id}`}
            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'text-slate-900'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-gradient-to-r from-blue-200 to-sky-200 rounded-lg"
                transition={prefersReducedMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-2">
              {tab.icon}
              {tab.label}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        id={`incident-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`incident-tab-${activeTab}`}
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      >
        {activeTab === 'alerts' && <AlertHistory />}
        {activeTab === 'events' && <IncidentHistory />}
      </motion.div>
    </motion.div>
  );
}

export default IncidentsPage;
