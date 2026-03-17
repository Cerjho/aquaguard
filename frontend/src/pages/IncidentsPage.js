/**
 * AquaGuard — Incidents Page
 *
 * Combines AlertHistory and IncidentHistory tables.
 */

import React, { useState } from 'react';
import AlertHistory from '../components/alerts/AlertHistory';
import IncidentHistory from '../components/events/IncidentHistory';

const TABS = [
  { id: 'alerts', label: 'Alert History' },
  { id: 'events', label: 'Detection Events' },
];

function IncidentsPage() {
  const [activeTab, setActiveTab] = useState('alerts');

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Incidents</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Historical alerts and detection events
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-200 -mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-150 ${
              activeTab === tab.id
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === 'alerts' && <AlertHistory />}
        {activeTab === 'events' && <IncidentHistory />}
      </div>
    </div>
  );
}

export default IncidentsPage;
