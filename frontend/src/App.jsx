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
import TopBar from './components/layout/TopBar.jsx';
import AlertPanel from './components/alerts/AlertPanel.jsx';

import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import IncidentsPage from './pages/IncidentsPage.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import SystemPage from './pages/SystemPage.jsx';

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
    return (
      <div className="flex h-screen items-center justify-center bg-[#f6fbff]">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div 
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-300 to-sky-400 mx-auto mb-4 flex items-center justify-center"
            animate={{ 
              boxShadow: [
                '0 6px 20px rgba(59, 130, 246, 0.18)',
                '0 12px 30px rgba(59, 130, 246, 0.24)',
                '0 6px 20px rgba(59, 130, 246, 0.18)',
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <svg
              className="w-8 h-8 text-white animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </motion.div>
          <p className="text-slate-600">Loading AquaGuard...</p>
        </motion.div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-[#f6fbff] overflow-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main id="main-content" className="flex-1 overflow-y-auto p-6" tabIndex={-1}>
          <AnimatedOutlet />
        </main>
      </div>
      <AlertPanel />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
