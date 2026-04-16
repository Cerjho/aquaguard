/**
 * AquaGuard — Dashboard Page (Ocean Theme)
 *
 * Features:
 * - Ocean-themed layout with glassmorphism
 * - Animated page entrance
 * - Real-time monitoring overview
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import CameraGrid from '../components/camera/CameraGrid.jsx';
import DetectionFeed from '../components/events/DetectionFeed.jsx';
import SystemStatus from '../components/system/SystemStatus.jsx';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function DashboardPage() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div 
      className="flex flex-col gap-6 h-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
      aria-label="Dashboard overview"
    >
      {/* Page header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-300 to-sky-400" />
          <div>
            <h2 className="text-3xl font-semibold text-slate-900 tracking-tight">Dashboard</h2>
            <p className="text-sm text-slate-600 mt-1">
              Real-time pool monitoring and alert overview
            </p>
          </div>
        </div>
      </motion.div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Camera feeds — takes 2/3 width on xl */}
        <motion.div 
          className="xl:col-span-2 space-y-4"
          variants={itemVariants}
        >
          <CameraGrid reloadToken={location.key} />
        </motion.div>

        {/* Right sidebar — detection feed + system status */}
        <motion.div 
          className="flex flex-col gap-6"
          variants={itemVariants}
        >
          <DetectionFeed />

          <div className="glass-subtle p-5 rounded-3xl border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-800">System Health</h3>
            </div>
            <SystemStatus showCameraIndicators showCameraStatusList={false} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default DashboardPage;
