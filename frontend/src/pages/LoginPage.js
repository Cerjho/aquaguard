/**
 * AquaGuard — Login Page
 *
 * Calls POST /api/v1/auth/login via AuthContext.login().
 * On success, redirects to the dashboard (/). 
 * Shows error messages on failure.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const { login, isAuthenticated, authError, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldError, setFieldError] = useState('');

  // If already authenticated, skip login
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError('');

    if (!username.trim()) {
      setFieldError('Username is required.');
      return;
    }
    if (!password) {
      setFieldError('Password is required.');
      return;
    }

    const success = await login(username.trim(), password, rememberMe);
    if (success) {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-900 to-slate-800">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-500 mb-4">
            {/* Water drop icon */}
            <svg
              className="w-9 h-9 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 7.52 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10C22 7.52 17.52 2 12 2zm0 2c.28 0 .56.03.83.07L5.07 11.83C5.03 11.56 5 11.28 5 11c0-3.87 3.13-7 7-7zm0 16c-4.42 0-8-3.58-8-8 0-.28.03-.56.07-.83l11.76-11.76c.27-.04.55-.07.83-.07 3.87 0 7 3.13 7 7s-3.13 7-7 7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-wide">AquaGuard</h1>
          <p className="text-sky-300 mt-1 text-sm">Drowning Detection &amp; Alert System</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-700 mb-6 text-center">
            Sign In
          </h2>

          {/* Error message */}
          {(authError || fieldError) && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"
            >
              {fieldError || authError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <div className="mb-4">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-600 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-800 placeholder-slate-400 disabled:bg-slate-100"
                placeholder="Enter your username"
              />
            </div>

            {/* Password */}
            <div className="mb-4">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-600 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-slate-800 placeholder-slate-400 disabled:bg-slate-100"
                placeholder="Enter your password"
              />
            </div>

            {/* Remember Me */}
            <div className="mb-6 flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 focus:ring-2 disabled:opacity-60"
              />
              <label
                htmlFor="rememberMe"
                className="ml-2 text-sm text-slate-600 select-none cursor-pointer"
              >
                Remember me for 30 days
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sky-400 text-xs mt-6">
          © {new Date().getFullYear()} AquaGuard — All rights reserved
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
