/**
 * AquaGuard — Dashboard Page
 *
 * Main dashboard layout combining:
 * - CameraGrid (left/main area)
 * - DetectionFeed + SystemStatus (right sidebar)
 */

import React from 'react';
import CameraGrid from '../components/camera/CameraGrid';
import DetectionFeed from '../components/events/DetectionFeed';
import SystemStatus from '../components/system/SystemStatus';

function DashboardPage() {
  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Real-time pool monitoring and alert overview
        </p>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Camera feeds — takes 2/3 width on xl */}
        <div className="xl:col-span-2">
          <CameraGrid />
        </div>

        {/* Right sidebar — detection feed + system status */}
        <div className="flex flex-col gap-6">
          <DetectionFeed />

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">System Health</h3>
            <SystemStatus />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
