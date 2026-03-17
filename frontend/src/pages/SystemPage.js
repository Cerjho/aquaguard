/**
 * AquaGuard — System Page
 *
 * Wraps the SystemStatus component with additional context.
 */

import React from 'react';
import SystemStatus from '../components/system/SystemStatus';

function SystemPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">System Status</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Real-time health of cameras, detection engine, and ESP32 devices
        </p>
      </div>

      <div className="max-w-2xl">
        <SystemStatus />
      </div>
    </div>
  );
}

export default SystemPage;
