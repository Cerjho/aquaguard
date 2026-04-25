/**
 * AquaGuard — Incidents Page.
 */

import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import AlertHistory from '../components/alerts/AlertHistory.jsx';
import IncidentHistory from '../components/events/IncidentHistory.jsx';

const TABS = [
  {
    id: 'alerts', label: 'Alert History', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    )
  },
  {
    id: 'events', label: 'Detection Events', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12h4.5L9 5l6 14 1.5-7H21" />
      </svg>
    )
  },
];

function IncidentsPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'alerts');
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state]);

  const headerTabs = (
    <div className="flex gap-8 h-full" role="tablist" aria-label="Incident views">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          aria-label={`Open ${tab.label}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={`relative py-4 text-sm font-medium transition-colors h-full flex items-center ${activeTab === tab.id
            ? 'text-slate-900'
            : 'text-slate-500 hover:text-slate-800'
            }`}
        >
          <span className="flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
          {activeTab === tab.id && (
            <motion.div
              layoutId="activeTabIndicator"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900 rounded-t-full"
              transition={prefersReducedMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </button>
      ))}
    </div>
  );

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
    >
      <div className="flex items-center gap-3">
        <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-300 to-sky-400" />
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Incidents</h2>
          <p className="text-sm text-slate-600 mt-1">
            Historical alerts and detection events
          </p>
        </div>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
      >
        {activeTab === 'alerts' && <AlertHistory headerTabs={headerTabs} />}
        {activeTab === 'events' && <IncidentHistory headerTabs={headerTabs} />}
      </motion.div>
    </motion.div>
  );
}

export default IncidentsPage;
