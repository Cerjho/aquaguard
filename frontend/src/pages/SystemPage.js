/**
 * AquaGuard — System Page
 *
 * Wraps the SystemStatus component with additional context.
 */

import React from 'react';
import SystemStatus from '../components/system/SystemStatus';
import CameraManagementPanel from '../components/camera/CameraManagementPanel';
import CameraGrid from '../components/camera/CameraGrid';
import { useAuth } from '../context/AuthContext';

function SystemPage() {
  const { canManageCameras } = useAuth();
  const [cameraReloadToken, setCameraReloadToken] = React.useState(0);

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800">System Status</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Real-time health of cameras, detection engine, and ESP32 devices
        </p>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <section
          aria-labelledby="system-health-title"
          className="2xl:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4"
        >
          <h3 id="system-health-title" className="text-sm font-semibold text-slate-700 mb-3">
            System Health
          </h3>
          <SystemStatus />
        </section>

        <section
          aria-labelledby="camera-operations-title"
          className="2xl:col-span-2 space-y-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 id="camera-operations-title" className="text-sm font-semibold text-slate-700 mb-1">
              {canManageCameras ? 'Camera Operations & Configuration' : 'Camera Overview'}
            </h3>
            <p className="text-xs text-slate-500">
              {canManageCameras
                ? 'Manage camera zones and refresh monitoring feeds after changes.'
                : 'View camera status and monitoring feeds.'}
            </p>
          </div>

          <CameraManagementPanel
            onCamerasChanged={() => setCameraReloadToken((prev) => prev + 1)}
          />

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              {canManageCameras ? 'Feed refresh preview' : 'Camera Feeds'}
            </h4>
            <p className="text-xs text-slate-500 mb-3">
              {canManageCameras
                ? 'Uses the shared refresh callback to verify camera grid updates after management actions.'
                : 'Live monitoring feeds from all active cameras.'}
            </p>
            <CameraGrid reloadToken={cameraReloadToken} />
          </div>
        </section>
      </div>
    </div>
  );
}

export default SystemPage;
