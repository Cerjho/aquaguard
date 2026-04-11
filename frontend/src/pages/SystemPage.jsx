/**
 * AquaGuard — System Page (Ocean Theme)
 *
 * System health monitoring and camera management.
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import SystemStatus from '../components/system/SystemStatus.jsx';
import CameraManagementPanel from '../components/camera/CameraManagementPanel.jsx';
import CameraGrid from '../components/camera/CameraGrid.jsx';

function SystemPage() {
  const [cameraReloadToken, setCameraReloadToken] = React.useState(0);
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
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">System Status</h2>
          <p className="text-sm text-slate-600 mt-1">
            Real-time health of cameras, detection engine, and ESP32 devices
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <motion.section
          aria-labelledby="system-health-title"
          className="2xl:col-span-1 glass-subtle p-5 rounded-3xl border border-slate-200"
          initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
        >
          <div className="flex items-center gap-2 mb-4">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 id="system-health-title" className="text-sm font-semibold text-slate-800">
              System Health
            </h3>
          </div>
          <SystemStatus />
        </motion.section>

        <motion.section
          aria-labelledby="camera-operations-title"
          className="2xl:col-span-2 space-y-4"
          initial={{ opacity: 0, x: prefersReducedMotion ? 0 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: prefersReducedMotion ? 0 : 0.2 }}
        >
          <div className="glass-subtle p-5 rounded-3xl border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 id="camera-operations-title" className="text-sm font-semibold text-slate-800">
                Camera Operations & Configuration
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Manage camera zones and refresh monitoring feeds after changes.
            </p>
          </div>

          <CameraManagementPanel
            onCamerasChanged={() => setCameraReloadToken((prev) => prev + 1)}
          />

          <div className="glass-subtle p-5 rounded-3xl border border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              <h4 className="text-sm font-medium text-slate-800">Feed Refresh Preview</h4>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Verify camera grid updates after management actions.
            </p>
            <CameraGrid reloadToken={cameraReloadToken} />
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}

export default SystemPage;
