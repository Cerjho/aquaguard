import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

function ResponderIdle({ cameraStatuses }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeCameras = Object.values(cameraStatuses).filter(c => c.status === 'online').length;
  const totalCameras = Object.values(cameraStatuses).length;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 select-none bg-[#020617]">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05),transparent_70%)] pointer-events-none" />
      <div className="caustic-bg opacity-30" />
      
      {/* Central Radar Pulse */}
      <div className="absolute w-32 h-32 rounded-full sonar-pulse opacity-20 pointer-events-none" />

      {/* Main Content */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 flex flex-col items-center text-center space-y-8 w-full max-w-sm"
      >
        {/* Status Header */}
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center space-x-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
            <span className="text-emerald-400 font-mono font-bold tracking-widest text-xs sm:text-sm uppercase">System Nominal</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-mono font-bold text-slate-200 uppercase tracking-tight">
            POOL SAFE
          </h1>
        </div>

        {/* Telemetry Minimal */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-[#05080f]/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Cameras</span>
            <span className="text-xl font-mono text-slate-300 font-bold">{activeCameras} <span className="text-slate-600 text-sm">/ {totalCameras}</span></span>
          </div>
          <div className="bg-[#05080f]/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Time</span>
            <span className="text-xl font-mono text-slate-300 font-bold tracking-tighter">
              {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-8">
          <p className="text-slate-600 font-mono text-[10px] uppercase tracking-widest">
            Awaiting Detections...
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default ResponderIdle;
