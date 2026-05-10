/**
 * AquaGuard — Root application with React Router v6 routing (Modern Minimalist).
 *
 * Route map:
 *   /        → DashboardPage  (private)
 *   /incidents → IncidentsPage (private)
 *   /analytics → AnalyticsPage (private)
 *   /system   → SystemPage    (private)
 *   /login    → LoginPage     (public)
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';

import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import MobileBottomNav from './components/layout/MobileBottomNav.jsx';
import FullScreenLoader from './components/layout/FullScreenLoader.jsx';
import AlertToast from './components/alerts/AlertToast.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import IncidentsPage from './pages/IncidentsPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import SystemPage from './pages/SystemPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';
import ResponderPage from './pages/ResponderPage.jsx';

import './App.css';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

function AnimatedOutlet() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  
  return (
    <motion.div
      key={location.pathname}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.3, ease: 'easeInOut' }}
      className="h-full"
    >
      <Outlet />
    </motion.div>
  );
}

function PrivateLayout() {
  const { isAuthenticated, initializingSession, currentUser } = useAuth();

  if (initializingSession) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser?.role === 'lifeguard') {
    return <Navigate to="/responder" replace />;
  }

  return (
    <div className="flex h-screen bg-[#0a0f18] text-slate-300 overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {/* Sidebar — hidden on mobile, visible from md breakpoint */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <main
          id="main-content"
          className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6"
          tabIndex={-1}
        >
          <AnimatedOutlet />
        </main>
      </div>
      {/* Mobile bottom navigation — hidden on md+ */}
      <MobileBottomNav />
      {/* Global alert toast */}
      <AlertToast />
    </div>
  );
}

function StandalonePrivateLayout() {
  const { isAuthenticated, initializingSession } = useAuth();

  if (initializingSession) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] text-slate-300 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <AnimatedOutlet />
    </div>
  );
}

function MobileResponderLayout() {
  const { isAuthenticated, initializingSession, currentUser } = useAuth();

  if (initializingSession) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser && currentUser.role !== 'lifeguard') {
    return <Navigate to="/" replace />;
  }

  // Responder layout is 100vh, hidden overflow, no sidebar, no bottom nav.
  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#020617] text-slate-300 overflow-hidden relative">
      <AnimatedOutlet />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<PrivateLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/system" element={<SystemPage />} />
          </Route>
          <Route element={<StandalonePrivateLayout />}>
            <Route path="/settings/password" element={<ChangePasswordPage />} />
          </Route>
          <Route element={<MobileResponderLayout />}>
            <Route path="/responder" element={<ResponderPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
