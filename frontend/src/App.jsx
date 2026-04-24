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
import AlertPanel from './components/alerts/AlertPanel.jsx';
import FullScreenLoader from './components/layout/FullScreenLoader.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import IncidentsPage from './pages/IncidentsPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import SystemPage from './pages/SystemPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';

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
  const { isAuthenticated, initializingSession } = useAuth();

  if (initializingSession) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <main id="main-content" className="flex-1 overflow-y-auto p-6" tabIndex={-1}>
          <AnimatedOutlet />
        </main>
      </div>
      <AlertPanel />
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
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
