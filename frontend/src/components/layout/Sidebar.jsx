/**
 * AquaGuard — Sidebar Navigation.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocketState, useSystemState, useAlertState } from '../../context/AlertContext.jsx';
import { normalizeServiceStatus } from '../../utils/statusHelpers';
import BrandMark from './BrandMark.jsx';

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: '/incidents',
    label: 'Incidents',
    end: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    end: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    to: '/system',
    label: 'System',
    end: false,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function Sidebar() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const popoverRef = useRef(null);
  const [clockStr, setClockStr] = useState('');
  const { socketConnected } = useSocketState();
  const { systemStatus } = useSystemState();
  const { pendingClipsCount } = useAlertState();

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // System health
  const deStatus = normalizeServiceStatus(systemStatus?.detection_engine?.status);
  const systemHealthy = socketConnected && (deStatus === 'online' || deStatus === 'active' || deStatus === 'running');
  const systemDegraded = socketConnected && !systemHealthy;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="w-[5.5rem] h-screen shrink-0 relative z-40">
      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsPopoverOpen(false); }}
        className={`absolute top-0 left-0 h-screen flex flex-col bg-[#0a0f18]/95 backdrop-blur-md border-r border-slate-800/80 shadow-[12px_0_32px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-50 ${isHovered ? 'w-64 p-4 rounded-r-3xl' : 'w-[5.5rem] p-3 rounded-none shadow-none bg-[#0a0f18]'}`}
      >
      {/* Brand Header */}
      <div className={`mb-4 mt-2 flex items-center ${isHovered ? 'px-4 justify-between' : 'px-0 justify-center w-full'}`}>
        <div className="relative flex items-center justify-center">
          <BrandMark className={isHovered ? 'flex-1' : ''} isExpanded={isHovered} showText={isHovered} />
          
          {/* Status Dot */}
          <span
            className={`absolute rounded-full shrink-0 transition-all duration-300 border-2 border-white ${
              isHovered ? '-top-1 -right-1 h-2.5 w-2.5' : '-top-1 -right-1 h-2.5 w-2.5'
            } ${
              systemHealthy
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse'
                : systemDegraded
                ? 'bg-amber-500'
                : 'bg-slate-300'
            }`}
            title={systemHealthy ? 'System online' : systemDegraded ? 'Degraded' : 'Connecting...'}
          />
        </div>
        {/* Live clock */}
        <div className={`overflow-hidden transition-all duration-300 ${isHovered ? 'max-h-10 opacity-100 block' : 'max-h-0 opacity-0 hidden'}`}>
          <p className="mt-2 px-1 text-[11px] font-mono tracking-wider text-slate-400 tabular-nums whitespace-nowrap">
            {clockStr}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 mt-6">
        {navItems.map((item, index) => (
          <div key={item.to} className={`flex items-center ${isHovered ? 'px-3' : 'justify-center w-full'}`}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group relative flex items-center rounded-xl font-mono font-bold tracking-wider text-sm transition-all duration-200 uppercase ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
                } ${isHovered ? 'w-full px-4 py-3 gap-3' : 'w-12 h-12 justify-center p-0'}`
              }
            >
              {({ isActive }) => (
                <motion.div
                  className={`flex items-center ${isHovered ? 'w-full' : 'justify-center'}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="shrink-0 flex items-center justify-center">
                    {item.icon}
                  </div>
                  
                  {/* Tooltip for collapsed state */}
                  <div className={`absolute left-[calc(100%+0.75rem)] px-2.5 py-1.5 bg-slate-800 text-white text-xs font-mono font-bold tracking-wider uppercase rounded shadow-[0_4px_16px_rgba(0,0,0,0.5)] whitespace-nowrap z-[100] opacity-0 group-focus-visible:opacity-100 pointer-events-none transition-opacity duration-200 delay-150 border border-slate-700 ${!isHovered ? 'group-hover:opacity-100' : 'hidden'}`}>
                    {item.label}
                  </div>
                  
                  <div className={`overflow-hidden transition-all duration-300 flex items-center ${isHovered ? 'w-full opacity-100 ml-3' : 'w-0 opacity-0 ml-0'}`}>
                    <span className="flex-1 whitespace-nowrap">{item.label}</span>
                    {item.to === '/incidents' && pendingClipsCount > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[1.25rem] text-center shadow-sm ml-2">
                      {pendingClipsCount}
                    </span>
                  )}
                </div>

                {isActive && (
                  <motion.div
                    layoutId="sidebarActiveBar"
                    className="absolute left-0 top-0 bottom-0 w-1 h-full rounded-r bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.div>
            )}
          </NavLink>
        </div>
        ))}
      </nav>

      {/* Account Card & Popover */}
      <div className="mt-auto relative" ref={popoverRef}>
        <AnimatePresence>
          {isPopoverOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full mb-3 w-full z-50 bg-slate-900 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] border border-slate-800 p-2.5"
              >
                <button
                  className="w-full text-left px-3 py-2.5 text-xs font-mono font-bold tracking-wider uppercase text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                  onClick={() => {
                  setIsPopoverOpen(false);
                  navigate('/settings/password');
                }}
              >
                Change Password
              </button>
              <div className="h-px bg-slate-800 my-1 mx-2" />
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                aria-label="Logout"
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono font-bold tracking-wider uppercase text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  <span>Logout</span>
                </div>
                {isLoggingOut && (
                  <svg className="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`flex items-center mb-2 ${isHovered ? 'px-3' : 'justify-center w-full'}`}>
            <div
              data-testid="account-menu-trigger"
              onClick={() => isHovered ? setIsPopoverOpen(!isPopoverOpen) : null}
              className={`flex items-center cursor-pointer rounded-xl transition-all duration-300 ${
                isHovered ? 'w-full p-3 gap-3 border' : 'w-12 h-12 p-0 justify-center border border-transparent'
              } ${
                isHovered && isPopoverOpen 
                  ? 'bg-slate-800 border-slate-700 shadow-[0_4px_16px_rgba(0,0,0,0.5)]' 
                  : isHovered 
                    ? 'bg-slate-900 border-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.5)] hover:border-slate-700 hover:bg-slate-800'
                    : 'bg-transparent hover:bg-slate-800/50'
              }`}
            >
              <div className="h-10 w-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            
              <div className={`overflow-hidden transition-all duration-300 flex items-center ${isHovered ? 'flex-1 opacity-100' : 'w-0 opacity-0'}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono font-bold tracking-wider text-slate-200 truncate uppercase">
                    {currentUser?.username || 'UNKNOWN'}
                  </p>
                  <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase truncate">
                    {currentUser?.role || 'USER'}
                  </p>
                </div>
              <svg 
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ml-2 ${isPopoverOpen ? 'rotate-180' : ''}`} 
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    {/* Version badge */}
    <div className={`flex justify-center overflow-hidden transition-all duration-300 ${isHovered ? 'px-4 pb-2 max-h-10 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}`}>
      <span className="text-[10px] font-medium text-slate-300 tracking-wider whitespace-nowrap">AquaGuard v1.0.0</span>
    </div>
    </aside>
    </div>
  );
}

export default Sidebar;
