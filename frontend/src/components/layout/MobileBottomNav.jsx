/**
 * AquaGuard — Mobile Bottom Navigation.
 *
 * Visible only on small screens (< md breakpoint).
 * Provides tab-style navigation and user account access for lifeguards in the field.
 *
 * Touch targets are minimum 44×44px (WCAG 2.5.5).
 * Uses glassmorphism styling consistent with the existing design system.
 */

import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAlertState } from '../../context/AlertContext.jsx';

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: '/incidents',
    label: 'Incidents',
    end: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    to: '/analytics',
    label: 'Analytics',
    end: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    to: '/system',
    label: 'System',
    end: false,
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function MobileBottomNav() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { pendingClipsCount } = useAlertState();
  const drawerRef = useRef(null);

  // Close drawer when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target)) {
        setIsDrawerOpen(false);
      }
    };
    if (isDrawerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDrawerOpen]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
      setIsDrawerOpen(false);
    }
  };

  return (
    <>
      {/* Account drawer — slides up from bottom nav */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
              onClick={() => setIsDrawerOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <motion.div
              ref={drawerRef}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed bottom-16 left-0 right-0 z-50 md:hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
              role="dialog"
              aria-modal="true"
              aria-label="Account menu"
            >
              <div className="mx-3 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] overflow-hidden">
                {/* User info header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-200 flex items-center justify-center shrink-0">
                    <svg className="h-5 w-5 text-slate-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {currentUser?.username || 'Unknown User'}
                    </p>
                    <p className="text-xs text-slate-500 capitalize truncate">
                      {currentUser?.role || 'User'}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-2">
                  <button
                    className="w-full text-left px-4 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 rounded-xl transition-colors flex items-center gap-3"
                    onClick={() => {
                      setIsDrawerOpen(false);
                      navigate('/settings/password');
                    }}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                    Change Password
                  </button>

                  <div className="h-px bg-slate-100 mx-2 my-1" />

                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="w-full text-left px-4 py-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50 active:bg-rose-100 rounded-xl transition-colors flex items-center justify-between gap-3"
                    style={{ touchAction: 'manipulation' }}
                    aria-label="Logout"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                      </svg>
                      Sign Out
                    </div>
                    {isLoggingOut && (
                      <svg className="animate-spin h-4 w-4 text-rose-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/90 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(15,23,42,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch h-16">
          {/* Nav tabs */}
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-1 transition-colors duration-200 touch-manipulation ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-slate-500 active:text-slate-800'
                }`
              }
              style={{ touchAction: 'manipulation', minHeight: '44px' }}
              aria-label={item.label}
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                      {item.icon}
                    </span>
                    {item.to === '/incidents' && pendingClipsCount > 0 && (
                      <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.125rem] text-center shadow-sm">
                        {pendingClipsCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium leading-none">
                    {item.label}
                  </span>
                  {isActive && (
                    <motion.span
                      layoutId="mobileActiveTab"
                      className="absolute bottom-0 h-0.5 w-8 bg-blue-600 rounded-t-full"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}

          {/* Vertical divider */}
          <div className="w-px bg-slate-100 self-stretch my-3" />

          {/* User / Account button */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen((v) => !v)}
            className="flex flex-col items-center justify-center gap-1 px-4 text-slate-500 active:text-slate-800 transition-colors duration-200"
            style={{ touchAction: 'manipulation', minHeight: '44px', minWidth: '60px' }}
            aria-label="Account menu"
            aria-expanded={isDrawerOpen}
          >
            <div className={`h-7 w-7 rounded-full border flex items-center justify-center transition-colors duration-200 ${
              isDrawerOpen ? 'bg-blue-50 border-blue-300' : 'bg-slate-100 border-slate-200'
            }`}>
              <svg className={`h-4 w-4 transition-colors duration-200 ${isDrawerOpen ? 'text-blue-600' : 'text-slate-500'}`} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <span className="text-[10px] font-medium leading-none">
              Account
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}

export default MobileBottomNav;
