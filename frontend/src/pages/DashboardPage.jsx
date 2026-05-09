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
import StatsBar from '../components/dashboard/StatsBar.jsx';

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
      className="flex flex-col gap-4 h-full bg-slate-950 rounded-3xl p-4 sm:p-6 text-slate-200 border border-slate-800 shadow-2xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
      aria-label="Dashboard overview"
    >
      {/* Page header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
          <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Mission Control</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Real-time monitoring terminal
            </p>
          </div>
        </div>
      </motion.div>

      {/* Hero KPI stats */}
      <motion.div variants={itemVariants}>
        <StatsBar />
      </motion.div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Camera feeds — takes 2/3 width on xl */}
        <motion.div 
          className="xl:col-span-2 space-y-4"
          variants={itemVariants}
        >
          <CameraGrid reloadToken={location.key} />
        </motion.div>

        {/* Right sidebar — detection feed + system status */}
        <motion.div 
          className="flex flex-col gap-4"
          variants={itemVariants}
        >
          <DetectionFeed />
          <SystemStatus showCameraIndicators showCameraStatusList={false} />
        </motion.div>
      </div>
    </motion.div>
  );
}

export default DashboardPage;
