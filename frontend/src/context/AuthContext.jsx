/**
 * AquaGuard — Authentication Context
 *
 * Provides: currentUser, login(), logout(), isAuthenticated
 * JWT is persisted as httpOnly cookies by the backend.
 * User profile is kept in memory for the current tab session.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../hooks/useApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializingSession, setInitializingSession] = useState(true);

  /**
   * Log in with username + password.
    * Calls POST /api/v1/auth/login and relies on backend-set httpOnly cookies.
   * @param {string} username
   * @param {string} password
   * @param {boolean} rememberMe - If true, requests extended token expiration
   * @returns {Promise<boolean>} true on success, false on failure
   */
  const login = useCallback(async (username, password, rememberMe = false) => {
    setLoading(true);
    setAuthError(null);
    try {
      const response = await api.post('/api/v1/auth/login', {
        username,
        password,
        remember_me: rememberMe
      });
      const { user } = response.data;

      setCurrentUser(user);
      return true;
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Login failed. Please check your credentials.';
      setAuthError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Log out the current user.
    * Clears auth cookies on backend and resets in-memory state.
   */
  const logout = useCallback(async () => {
    // Dispatch event to disconnect WebSocket before clearing auth state
    window.dispatchEvent(new Event('user-logout'));
    // Small delay to allow socket to disconnect cleanly before invalidating cookies
    await new Promise(resolve => setTimeout(resolve, 50));
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore logout API errors — always clear local state
    } finally {
      setCurrentUser(null);
    }
  }, []);

  /**
   * Restore session on mount by checking if httpOnly cookies are valid.
   * Calls GET /api/v1/auth/me to validate token and retrieve user profile.
   */
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const response = await api.get('/api/v1/auth/me');
        const { user } = response.data;
        setCurrentUser(user);
      } catch (error) {
        // Session invalid or no cookies — user is not authenticated
        setCurrentUser(null);
      } finally {
        setInitializingSession(false);
      }
    };

    restoreSession();
  }, []);

  const isAuthenticated = Boolean(currentUser);

  const value = {
    currentUser,
    isAuthenticated,
    authError,
    loading,
    initializingSession,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 * @returns {{ currentUser, isAuthenticated, authError, loading, initializingSession, login, logout }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
