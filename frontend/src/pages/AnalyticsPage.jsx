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
        <div className="w-1.5 h-10 rounded bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]" />
        <div>
          <h2 className="text-2xl font-mono font-bold tracking-[0.2em] text-slate-200 uppercase">ANALYTICS</h2>
          <p className="text-[10px] font-mono tracking-widest text-slate-500 mt-1 uppercase">
            DETECTION FREQUENCY, ALERT TRENDS, AND ZONE SUMMARIES
          </p>
        </div>
      </div>

      <AnalyticsChart />
    </motion.div>
  );
}

export default AnalyticsPage;
