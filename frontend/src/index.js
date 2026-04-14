/**
 * AquaGuard — React application entry point.
 *
 * Provider hierarchy (outer → inner):
 *   React.StrictMode
 *     AuthProvider      ← JWT and user session
 *       DataCacheProvider ← Shared data cache for instant page loads
 *         AlertProvider ← WebSocket alert state (needs token from AuthProvider)
 *           App         ← Router + pages
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { DataCacheProvider } from './context/DataCacheContext.jsx';
import { AlertProvider } from './context/AlertContext.jsx';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <AuthProvider>
      <DataCacheProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </DataCacheProvider>
    </AuthProvider>
  </React.StrictMode>
);
