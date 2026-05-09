/**
 * AquaGuard — System Page (Ocean Theme)
 *
 * System health monitoring and camera management.
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import SystemStatus from '../components/system/SystemStatus.jsx';
import CameraManagementPanel from '../components/camera/CameraManagementPanel.jsx';

function SystemPage() {
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
        <div className="w-1.5 h-10 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">System Status</h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time health of cameras, detection engine, and ESP32 devices
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.section
          aria-label="System diagnostics"
          className="lg:col-span-1"
          initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
        >
          <SystemStatus showCameraIndicators showCameraStatusList={false} />
        </motion.section>

        <motion.section
          className="lg:col-span-2"
          initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
        >
          <CameraManagementPanel />
        </motion.section>
      </div>
    </motion.div>
  );
}

export default SystemPage;
