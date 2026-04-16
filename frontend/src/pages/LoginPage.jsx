/**
 * AquaGuard — Login Page.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';

function LoginPage() {
  const prefersReducedMotion = useReducedMotion();
  const { login, isAuthenticated, authError, loading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  const isSubmitting = loading || submitted;
  const submitState = authSuccess ? 'success' : isSubmitting ? 'loading' : 'idle';

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (authError) {
      setSubmitted(false);
      setAuthSuccess(false);
    }
  }, [authError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError('');
    setAuthSuccess(false);
    setSubmitted(false);

    if (!username.trim()) {
      setFieldError('Username is required.');
      return;
    }
    if (!password) {
      setFieldError('Password is required.');
      return;
    }

    setSubmitted(true);
    const success = await login(username.trim(), password, rememberMe);
    if (success) {
      setAuthSuccess(true);
      if (!prefersReducedMotion) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      navigate('/', { replace: true });
      return;
    }
    setSubmitted(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#ffffff] px-4">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(1200px 600px at -10% -20%, rgba(163, 206, 241, 0.42), transparent 62%),
            radial-gradient(900px 500px at 110% 0%, rgba(231, 236, 239, 0.95), transparent 60%),
            radial-gradient(1200px 700px at 50% 120%, rgba(163, 206, 241, 0.26), transparent 58%),
            linear-gradient(180deg, #ffffff 0%, #f8fbff 52%, #e7ecef 100%)
          `,
        }}
      />

      <motion.div
        className="absolute h-[28rem] w-[28rem] rounded-full bg-[#a3cef1]/25 blur-3xl"
        animate={prefersReducedMotion ? undefined : {
          x: [0, 70, 0],
          y: [0, -35, 0],
        }}
        transition={prefersReducedMotion ? undefined : { duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        style={{ top: '6%', left: '-6%' }}
      />
      <motion.div
        className="absolute h-[24rem] w-[24rem] rounded-full bg-[#e7ecef] blur-3xl"
        animate={prefersReducedMotion ? undefined : {
          x: [0, -65, 0],
          y: [0, 65, 0],
        }}
        transition={prefersReducedMotion ? undefined : { duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        style={{ bottom: '-6%', right: '-5%' }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <motion.div 
          className="mb-9 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div 
            className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-3xl border border-white bg-white/85 backdrop-blur-xl"
            animate={{ 
              boxShadow: [
                '0 20px 50px rgba(0,0,0,0.05)',
                '0 24px 58px rgba(0,0,0,0.07)',
                '0 20px 50px rgba(0,0,0,0.05)',
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg
              className="h-10 w-10 text-slate-700"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0l5.65-5.66zm0-2.83L4.93 6.93a10 10 0 1 0 14.14 0L12-.14z" />
              <path d="M12 8a4 4 0 0 0-4 4c0 .55.45 1 1 1s1-.45 1-1a2 2 0 0 1 2-2c.55 0 1-.45 1-1s-.45-1-1-1z" />
            </svg>
          </motion.div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">AquaGuard</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">Drowning Detection & Alert System</p>
        </motion.div>

        {/* Login card */}
        <motion.div 
          className="rounded-3xl border border-white bg-white/80 p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.05)]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h2 className="mb-7 text-center text-xl font-semibold text-slate-900">
            Welcome Back
          </h2>

          {/* Error message */}
          {(authError || fieldError) && (
            <motion.div
              role="alert"
              className="mb-4 rounded-2xl border border-rose-200 bg-rose-100 p-3 text-sm text-rose-700"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              {fieldError || authError}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Username */}
            <div className="mb-4">
              <div className="relative">
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                className="peer w-full rounded-2xl border border-slate-200 bg-white px-4 pb-2.5 pt-5 text-slate-800 outline-none transition-all duration-500 ease-in-out placeholder:text-transparent focus:border-[#a3cef1] focus:ring-2 focus:ring-[#a3cef1]/35"
                placeholder="Username"
              />
                <label
                  htmlFor="username"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500 transition-all duration-300 peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-slate-600 peer-[&:not(:placeholder-shown)]:top-3 peer-[&:not(:placeholder-shown)]:translate-y-0 peer-[&:not(:placeholder-shown)]:text-xs peer-[&:not(:placeholder-shown)]:text-slate-600"
                >
                  Username
                </label>
              </div>
            </div>

            {/* Password */}
            <div className="mb-4">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  className="peer w-full rounded-2xl border border-slate-200 bg-white px-4 pb-2.5 pt-5 pr-12 text-slate-800 outline-none transition-all duration-500 ease-in-out placeholder:text-transparent focus:border-[#a3cef1] focus:ring-2 focus:ring-[#a3cef1]/35"
                  placeholder="Password"
                />
                <label
                  htmlFor="password"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-500 transition-all duration-300 peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-slate-600 peer-[&:not(:placeholder-shown)]:top-3 peer-[&:not(:placeholder-shown)]:translate-y-0 peer-[&:not(:placeholder-shown)]:text-xs peer-[&:not(:placeholder-shown)]:text-slate-600"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-700 focus-ring"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="mb-7 flex items-center">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 rounded border-slate-300 bg-white text-[#8fc0eb] focus-ring"
              />
              <label
                htmlFor="rememberMe"
                className="ml-2 cursor-pointer select-none text-sm text-slate-600"
              >
                Remember me for 30 days
              </label>
            </div>

            {/* Submit */}
            <div className="flex flex-col items-center">
              <motion.button
                type="submit"
                aria-label="Sign In"
                disabled={isSubmitting}
                className={`relative overflow-hidden rounded-2xl border border-[#a3cef1]/65 bg-gradient-to-r from-[#a3cef1] to-[#b6d9f4] text-slate-900 shadow-[0_12px_28px_rgba(163,206,241,0.45)] transition-all duration-500 ease-in-out ${
                  submitState === 'idle' ? 'w-full py-3.5' : 'w-14 py-3.5'
                }`}
                whileHover={submitState === 'idle' && !prefersReducedMotion ? { scale: 1.01 } : {}}
                whileTap={submitState === 'idle' && !prefersReducedMotion ? { scale: 0.99 } : {}}
              >
                {submitState === 'idle' && (
                  <span className="text-base font-semibold">Secure Login</span>
                )}

                {submitState !== 'idle' && (
                  <span className="mx-auto block h-6 w-6 rounded-full border border-white/90 bg-white/20">
                    <motion.span
                      className="absolute inset-0 m-auto h-6 w-6 rounded-full border border-white/90"
                      animate={prefersReducedMotion ? undefined : { scale: [1, 1.5, 1], opacity: [0.85, 0, 0.85] }}
                      transition={prefersReducedMotion ? undefined : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </span>
                )}
              </motion.button>

              <motion.p
                className="mt-3 text-sm text-slate-600"
                initial={false}
                animate={{
                  opacity: submitState === 'loading' ? 1 : 0,
                  y: submitState === 'loading' ? 0 : -4,
                  height: submitState === 'loading' ? 'auto' : 0,
                }}
                transition={{ duration: prefersReducedMotion ? 0.01 : 0.5, ease: 'easeInOut' }}
              >
                Authenticating Secure Connection...
              </motion.p>
            </div>
          </form>
        </motion.div>

        <motion.p 
          className="mt-8 text-center text-xs text-slate-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          © {new Date().getFullYear()} AquaGuard — IoT Drowning Detection System
        </motion.p>
      </div>
    </div>
  );
}

export default LoginPage;
