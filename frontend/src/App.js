/**
 * AquaGuard — Root application with React Router v6 routing.
 *
 * Route map:
 *   /        → DashboardPage  (private)
 *   /incidents → IncidentsPage (private)
 *   /analytics → AnalyticsPage (private)
 *   /system   → SystemPage    (private)
 *   /login    → LoginPage     (public)
 *
 * Private routes redirect to /login when no JWT token is present.
 * Layout (Sidebar + TopBar) wraps all private routes.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

import { useAuth } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import AlertPanel from './components/alerts/AlertPanel';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import IncidentsPage from './pages/IncidentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SystemPage from './pages/SystemPage';

import './App.css';

/**
 * PrivateLayout — renders Sidebar + TopBar + child routes.
 * Redirects to /login if the user is not authenticated.
 */
function PrivateLayout() {
  const { isAuthenticated, loading } = useAuth();

  // Wait for session restoration to complete before redirecting
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4">
          <Outlet />
        </main>
      </div>

      {/* Full-screen alert overlay (rendered at app level so it covers everything) */}
      <AlertPanel />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Private routes — wrapped in PrivateLayout */}
          <Route element={<PrivateLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/system" element={<SystemPage />} />
          </Route>

          {/* Fallback — redirect unknown paths to root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
