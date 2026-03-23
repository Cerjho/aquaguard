/**
 * AquaGuard — Analytics Page
 *
 * Wraps the AnalyticsChart component.
 */

import React from 'react';
import AnalyticsChart from '../components/analytics/AnalyticsChart';

function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Analytics</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Detection frequency, alert trends, and zone summaries
        </p>
      </div>

      <AnalyticsChart />
    </div>
  );
}

export default AnalyticsPage;
