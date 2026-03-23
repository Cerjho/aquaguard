/**
 * AquaGuard — React application entry point.
 *
 * Provider hierarchy (outer → inner):
 *   React.StrictMode
 *     AuthProvider    ← JWT and user session
 *       AlertProvider ← WebSocket alert state (needs token from AuthProvider)
 *         App         ← Router + pages
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { AlertProvider } from './context/AlertContext';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <AuthProvider>
      <AlertProvider>
        <App />
      </AlertProvider>
    </AuthProvider>
  </React.StrictMode>
);
