import React, { useEffect } from 'react';
import { useAlertState, useSystemState } from '../context/AlertContext.jsx';
import ResponderIdle from '../components/responder/ResponderIdle.jsx';
import ResponderAlert from '../components/responder/ResponderAlert.jsx';

function ResponderPage() {
  const { activeAlerts } = useAlertState();
  const { cameraStatuses } = useSystemState();

  // Pick the most critical active alert to display, or just the first one
  const currentAlert = activeAlerts.length > 0 ? activeAlerts[0] : null;

  // Attempt to keep the screen awake if possible via WakeLock API
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // WakeLock not supported or denied
      }
    };
    
    requestWakeLock();
    
    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (currentAlert) {
    return <ResponderAlert alert={currentAlert} />;
  }

  return <ResponderIdle cameraStatuses={cameraStatuses} />;
}

export default ResponderPage;
