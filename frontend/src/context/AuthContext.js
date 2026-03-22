/**
 * AquaGuard — Authentication Context
 *
 * Provides: currentUser, login(), logout(), isAuthenticated
 * JWT is stored in localStorage under the key "token".
 * User profile is stored under the key "user".
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../hooks/useApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(false);

  /**
   * Log in with username + password.
   * Calls POST /api/v1/auth/login, stores token and user in localStorage.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>} true on success, false on failure
   */
  const login = useCallback(async (username, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const response = await api.post('/api/v1/auth/login', { username, password });
      const { access_token, user } = response.data;

      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
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
   * Clears localStorage and resets state.
   */
  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Ignore logout API errors — always clear local state
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setCurrentUser(null);
    }
  }, []);

  const isAuthenticated = Boolean(currentUser && localStorage.getItem('token'));

  const value = {
    currentUser,
    isAuthenticated,
    authError,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 * @returns {{ currentUser, isAuthenticated, authError, loading, login, logout }}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

export default AuthContext;
