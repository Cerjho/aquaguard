import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import useWebRTCStream from '../../hooks/useWebRTCStream';
import api from '../../hooks/useApi';
import { useAlertState } from '../../context/AlertContext.jsx';

function ResponderAlert({ alert }) {
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [viewLive, setViewLive] = useState(false);
  const { dismissActive } = useAlertState();

  const isClaimed = acknowledged || alert.status === 'acknowledged';

  // Streaming State
  const [streamToken, setStreamToken] = useState(null);
  const [streamSessionId] = useState(() => Date.now());
  const videoRef = useRef(null);

  // Fetch token when viewLive is activated
  useEffect(() => {
    let mounted = true;
    if (viewLive && alert?.zone_id) {
      api.get(`/api/v1/cameras/${alert.zone_id}/stream-token`)
        .then(res => {
          if (mounted) {
            const token = res?.data?.data?.stream_token || res?.data?.data?.token || res?.data?.data?.access_token;
            if (token) setStreamToken(token);
          }
        }).catch(() => {});
    }
    return () => { mounted = false; };
  }, [viewLive, alert?.zone_id]);

  const { transport, streamUrl, videoStream } = useWebRTCStream({
    zoneId: alert?.zone_id,
    streamToken,
    streamSessionId,
    shouldRenderStream: viewLive,
    isActive: viewLive,
  });

  useEffect(() => {
    if (!videoRef.current) return;
    if (videoStream) {
      videoRef.current.srcObject = videoStream;
    } else {
      videoRef.current.srcObject = null;
    }
  }, [videoStream]);

  // Timer & Escalation
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Haptic feedback & Escalation triggers
  useEffect(() => {
    if (isClaimed) return;

    const vibrate = (pattern) => {
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    };

    // Initial massive vibration
    if (activeSeconds === 0) {
      vibrate([500, 200, 500, 200, 500]);
    }
    
    // Escalation at 10s
    if (activeSeconds === 10) {
      vibrate([1000, 200, 1000, 200, 1000]);
    }

    // Escalation at 20s
    if (activeSeconds === 20) {
      vibrate([2000, 100, 2000, 100, 2000]);
    }
  }, [activeSeconds, isClaimed]);

  const handleAcknowledge = async () => {
    setAcknowledged(true);
    if ('vibrate' in navigator) {
      navigator.vibrate([100]); // Short tick for interaction
    }
    
    try {
      if (alert?.alert_id) {
        await api.post(`/api/v1/alerts/${alert.alert_id}/acknowledge`);
      } else if (alert?.event_id) {
        await api.post(`/api/v1/alerts/${alert.event_id}/acknowledge`);
      }
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleDismiss = () => {
    if (alert?.alert_id) dismissActive(alert.alert_id);
    else if (alert?.event_id) dismissActive(alert.event_id);
  };

  const handleViewLive = () => {
    setViewLive(true);
    if ('vibrate' in navigator) {
      navigator.vibrate([50]);
    }
  };

  // The actual active alert UI
  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-between p-6 select-none transition-colors duration-300 ${isClaimed ? 'bg-amber-900/20 border-8 border-amber-600' : 'bg-rose-950/40 border-8 border-rose-600 animate-pulse-fast'}`}>
      
      {/* Background Pulse */}
      {!isClaimed && (
        <div className="absolute inset-0 bg-rose-600/10 pointer-events-none" />
      )}

      {/* Header Info */}
      <div className="z-10 w-full flex flex-col items-center text-center mt-8">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`px-4 py-1.5 rounded-full font-mono font-bold uppercase tracking-widest text-xs mb-6 shadow-lg ${
            isClaimed ? 'bg-amber-600 text-amber-100 shadow-[0_0_20px_rgba(217,119,6,0.8)]' : 'bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.8)]'
          }`}
        >
          {isClaimed ? 'LIFEGUARD EN ROUTE' : 'CRITICAL PRIORITY'}
        </motion.div>

        <h1 className={`text-4xl sm:text-5xl md:text-6xl font-mono font-black uppercase tracking-tighter leading-none ${isClaimed ? 'text-amber-500 [text-shadow:0_4px_20px_rgba(245,158,11,0.5)]' : 'text-rose-500 [text-shadow:0_4px_20px_rgba(225,29,72,0.5)]'}`}>
          {isClaimed ? 'RESPONDER\nCLAIMED' : 'DROWNING\nDETECTED'}
        </h1>

        <div className="mt-8 flex flex-col items-center space-y-2">
          <p className="text-2xl font-bold text-white uppercase tracking-wider">{alert.zone_name || alert.zone_id}</p>
          {!isClaimed && <p className="text-rose-400 font-mono text-lg">CONFIDENCE: {Math.round(alert.confidence * 100)}%</p>}
          {isClaimed && <p className="text-amber-400 font-mono text-sm tracking-widest">ASSIGNED TO: {alert.acknowledged_by || 'RESPONDER'}</p>}
        </div>
      </div>

      {/* Escalation Timer */}
      <div className="z-10 w-full flex justify-center py-8">
        <div className={`font-mono text-3xl font-black ${activeSeconds > 20 && !isClaimed ? 'text-rose-500 animate-bounce' : 'text-slate-300'}`}>
          00:{activeSeconds.toString().padStart(2, '0')}
        </div>
      </div>

      {/* Big Action Buttons */}
      <div className="z-10 w-full max-w-sm flex flex-col space-y-4 mb-8">
        {viewLive ? (
          <div className="w-full aspect-video bg-black rounded-2xl border-2 border-rose-500/50 flex items-center justify-center overflow-hidden relative shadow-[0_0_30px_rgba(225,29,72,0.3)]">
             {!streamToken ? (
               <span className="text-slate-500 font-mono text-sm absolute z-10">Authorizing Stream...</span>
             ) : transport === 'webrtc' && videoStream ? (
               <video
                 ref={videoRef}
                 autoPlay
                 muted
                 playsInline
                 className="w-full h-full object-cover"
               />
             ) : streamUrl ? (
               <img
                 src={streamUrl}
                 alt={`Live feed - ${alert.zone_name || alert.zone_id}`}
                 className="w-full h-full object-cover"
                 onError={(e) => { e.target.style.display = 'none'; }}
               />
             ) : (
               <span className="text-slate-500 font-mono text-sm absolute z-10">Connecting Stream...</span>
             )}
             
             {/* Surveillance overlay for cinematic feel */}
             <div className="scan-line-overlay pointer-events-none" />
             <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
             <div className="absolute bottom-2 left-2 flex items-center gap-1 pointer-events-none">
               <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
               <span className="text-[10px] font-bold text-white tracking-widest [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">LIVE</span>
             </div>

             <button 
               onClick={() => setViewLive(false)}
               className="absolute top-2 right-2 bg-black/60 p-2 rounded-full text-white z-50 hover:bg-black/90 hover:text-rose-400 transition-colors backdrop-blur-sm"
               aria-label="Close Live Stream"
             >
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
               </svg>
             </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleViewLive}
            className="w-full py-5 rounded-2xl bg-[#05080f] border border-cyan-500/30 text-cyan-400 font-mono font-bold text-xl uppercase tracking-widest active:scale-95 transition-transform"
          >
            [ VIEW LIVE ]
          </button>
        )}

        {isClaimed ? (
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full py-6 rounded-2xl border-2 border-amber-500/50 bg-amber-900/40 text-amber-400 hover:bg-amber-800/60 hover:text-amber-200 font-mono font-black text-2xl uppercase tracking-widest active:scale-95 transition-all shadow-[0_0_20px_rgba(217,119,6,0.2)]"
          >
            [ CLEAR SCREEN ]
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAcknowledge}
            className="w-full py-6 rounded-2xl bg-rose-600 text-white hover:bg-rose-500 hover:shadow-[0_0_40px_rgba(225,29,72,0.6)] font-mono font-black text-2xl uppercase tracking-widest active:scale-95 transition-all shadow-[0_0_30px_rgba(225,29,72,0.4)]"
          >
            [ ACKNOWLEDGE ]
          </button>
        )}
      </div>

    </div>
  );
}

export default ResponderAlert;
