/**
 * AquaGuard — Analytics Page (Ocean Theme)
 *
 * Data visualization and analytics overview.
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import AnalyticsChart from '../components/analytics/AnalyticsChart.jsx';

function AnalyticsPage() {
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
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">Analytics</h2>
          <p className="text-sm text-slate-600 mt-1">
            Detection frequency, alert trends, and zone summaries
          </p>
        </div>
      </div>

      <AnalyticsChart />
    </motion.div>
  );
}

export default AnalyticsPage;
