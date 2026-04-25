/**
 * AquaGuard — Change Password Page.
 *
 * Fully wired to POST /api/v1/auth/change-password.
 * Features: floating labels, show/hide toggle, strength meter,
 *           loading spinner, animated success state.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import gsap from 'gsap';
import api from '../hooks/useApi';
import rocketLottie from '../vector/rocket.lottie';
import successLottie from '../vector/success.lottie';

// ---------------------------------------------------------------------------
// Password strength helpers
// ---------------------------------------------------------------------------
function getStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return score; // 0–5
}

const STRENGTH_LABELS = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
const STRENGTH_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

function StrengthBar({ password }) {
  const score = getStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2 px-1">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ backgroundColor: score >= n ? STRENGTH_COLORS[score] : '#e2e8f0' }}
          />
        ))}
      </div>
      <p className="text-xs font-medium" style={{ color: STRENGTH_COLORS[score] }}>
        {STRENGTH_LABELS[score]}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eye icon toggle
// ---------------------------------------------------------------------------
function EyeIcon({ show, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Floating label input wrapper
// ---------------------------------------------------------------------------
function PasswordField({ id, label, value, onChange, show, onToggle, hasError }) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        id={id}
        className={`peer block w-full appearance-none rounded-xl border-2 bg-transparent px-4 pb-2.5 pt-5 text-sm text-slate-900 transition-all duration-200 focus:outline-none focus:ring-2 pr-12 ${
          hasError
            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
            : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
        }`}
        placeholder=" "
        value={value}
        onChange={onChange}
        required
      />
      <label
        htmlFor={id}
        className={`absolute left-4 top-3.5 z-10 origin-[0] -translate-y-2 scale-[0.85] transform text-sm transition-all duration-200 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2 peer-focus:scale-[0.85] cursor-text ${
          hasError
            ? 'text-red-500 peer-focus:text-red-500'
            : 'text-slate-500 peer-focus:text-blue-500'
        }`}
      >
        {label}
      </label>
      <EyeIcon show={show} onClick={onToggle} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const lottieRef = useRef(null);

  useEffect(() => {
    if (!isSuccess && lottieRef.current) {
      gsap.fromTo(
        lottieRef.current,
        { opacity: 0, scale: 0.95, y: 30 },
        { opacity: 1, scale: 1, y: 0, duration: 1.2, ease: 'power3.out', delay: 0.1 }
      );
    }
  }, [isSuccess]);

  // Redirect to dashboard after success animation plays
  useEffect(() => {
    if (!isSuccess) return undefined;
    const timer = setTimeout(() => navigate('/'), 2800);
    return () => clearTimeout(timer);
  }, [isSuccess, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/api/v1/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setIsSuccess(true);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to update password. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8">
      <AnimatePresence mode="wait">
        {!isSuccess ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-8">
              <div ref={lottieRef} className="w-48 h-48 mb-2 relative">
                <DotLottieReact src={rocketLottie} loop autoplay />
              </div>
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">Change Password</h2>
              <p className="text-sm text-slate-500">
                Secure your account by choosing a strong, new password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Current password */}
              <PasswordField
                id="currentPassword"
                label="Current Password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); clearError(); }}
                show={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                hasError={false}
              />

              {/* New password + strength */}
              <div>
                <PasswordField
                  id="newPassword"
                  label="New Password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); clearError(); }}
                  show={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  hasError={Boolean(error)}
                />
                <StrengthBar password={newPassword} />
              </div>

              {/* Confirm password */}
              <div>
                <PasswordField
                  id="confirmPassword"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearError(); }}
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  hasError={Boolean(error)}
                />
                <AnimatePresence>
                  {error && (
                    <motion.p
                      key="err"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-red-500 text-sm font-medium mt-2 pl-2"
                      role="alert"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-2 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors shadow-sm"
                >
                  {isLoading && (
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  )}
                  {isLoading ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center text-center py-12"
          >
            <div className="w-56 h-56 mb-4">
              <DotLottieReact src={successLottie} loop={false} autoplay />
            </div>
            <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-2">Password Updated!</h2>
            <p className="text-slate-500">Redirecting you back to the dashboard…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
