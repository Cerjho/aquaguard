/**
 * AquaGuard — Login Page.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { useAuth } from '../context/AuthContext.jsx';

function LoginPage() {
  const prefersReducedMotion = useReducedMotion();
  const { login, isAuthenticated, authError, loading, currentUser } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const letterRefs = useRef([]);
  const activeLetterRef = useRef(null);
  const letterLockRef = useRef(new Set());
  const letterUnlockTimersRef = useRef({});
  const loginButtonRef = useRef(null);
  const formPanelRef = useRef(null);
  const mediaPanelRef = useRef(null);
  const mediaVideoRef = useRef(null);
  const customLoaderRef = useRef(null);
  const welcomeText = 'MISSION CONTROL';
  const welcomeLetters = welcomeText.split('');
  const hoverPalette = ['#22d3ee', '#06b6d4', '#0891b2', '#0ea5e9'];

  const isSubmitting = loading || submitted;
  const submitState = authSuccess ? 'success' : isSubmitting ? 'loading' : 'idle';

  useEffect(() => {
    if (isAuthenticated && currentUser) {
      if (currentUser.role === 'lifeguard') {
        navigate('/responder', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [isAuthenticated, currentUser, navigate]);

  useEffect(() => {
    if (authError) {
      setSubmitted(false);
      setAuthSuccess(false);
    }
  }, [authError]);

  useEffect(() => {
    let loaderTween;
    if (isSubmitting && customLoaderRef.current) {
      loaderTween = gsap.to(customLoaderRef.current, {
        rotation: 360,
        duration: 1,
        ease: 'none',
        repeat: -1
      });
    }
    return () => {
      if (loaderTween) loaderTween.kill();
    };
  }, [isSubmitting]);

  useEffect(() => {
    letterRefs.current.forEach((el) => {
      if (!el) return;
      gsap.set(el, { transformOrigin: '50% 100%' });
    });
  }, []);

  useEffect(
    () => () => {
      if (mediaVideoRef.current) gsap.killTweensOf(mediaVideoRef.current);
      Object.values(letterUnlockTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    },
    []
  );

  useEffect(() => {
    if (prefersReducedMotion) return undefined;

    const handleGlobalMouseMove = (event) => {
      if (!mediaVideoRef.current) return;

      const offsetX = (event.clientX / window.innerWidth - 0.5) * 2;
      const offsetY = (event.clientY / window.innerHeight - 0.5) * 2;

      gsap.to(mediaVideoRef.current, {
        x: offsetX * 14,
        y: offsetY * 6,
        duration: 0.6,
        ease: 'power3.out',
        overwrite: 'auto',
      });
    };

    const handleGlobalMouseLeave = () => {
      if (mediaVideoRef.current) {
        gsap.to(mediaVideoRef.current, {
          x: 0,
          y: 0,
          duration: 0.7,
          ease: 'power3.out',
          overwrite: 'auto',
        });
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseleave', handleGlobalMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseleave', handleGlobalMouseLeave);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion || !formPanelRef.current) return undefined;

    const introItems = formPanelRef.current.querySelectorAll('[data-intro-item]');
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    if (mediaPanelRef.current) {
      gsap.set(mediaPanelRef.current, { autoAlpha: 0, x: -20, scale: 1.03 });
      tl.to(mediaPanelRef.current, { autoAlpha: 1, x: 0, scale: 1, duration: 0.7 }, 0.04);
    }

    gsap.set(formPanelRef.current, { autoAlpha: 0, x: 24 });
    gsap.set(introItems, { autoAlpha: 0, y: 16 });

    tl.to(formPanelRef.current, { autoAlpha: 1, x: 0, duration: 0.62 }, 0.14).to(
      introItems,
      { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out' },
      0.28
    );

    return () => {
      tl.kill();
    };
  }, [prefersReducedMotion]);

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

  const handleLetterEnter = (index) => {
    if (prefersReducedMotion) return;
    const target = letterRefs.current[index];
    if (!target || letterLockRef.current.has(index)) return;
    const hoverColor = '#22d3ee'; // cyan-400
    target.dataset.hoverColor = hoverColor;
    letterLockRef.current.add(index);

    gsap.killTweensOf(target);
    gsap.set(target, { color: hoverColor, textShadow: '0 0 12px rgba(34,211,238,0.8)' });
    
    // Tactical glitch effect instead of bouncy cartoon effect
    gsap.to(target, {
      keyframes: [
        { x: -2, y: 1, scale: 1.1, skewX: 10, opacity: 0.8, duration: 0.04 },
        { x: 2, y: -1, scale: 1, skewX: -10, opacity: 1, duration: 0.04 },
        { x: -1, y: 2, scale: 1.05, skewX: 5, opacity: 0.5, duration: 0.04 },
        { x: 1, y: -2, scale: 1, skewX: -5, opacity: 1, duration: 0.04 },
        { x: 0, y: 0, scale: 1, skewX: 0, opacity: 1, duration: 0.04 },
      ],
      ease: 'steps(1)',
    });

    if (letterUnlockTimersRef.current[index]) {
      clearTimeout(letterUnlockTimersRef.current[index]);
    }
    letterUnlockTimersRef.current[index] = setTimeout(() => {
      letterLockRef.current.delete(index);
      delete letterUnlockTimersRef.current[index];
    }, 400);
  };

  const handleLetterLeave = (index) => {
    const target = letterRefs.current[index];
    if (!target) return;
    const hoverColor = target.dataset.hoverColor || '#22d3ee';

    if (!letterLockRef.current.has(index)) {
      gsap.killTweensOf(target);
      gsap.to(target, {
        duration: 0.1,
        x: 0,
        y: 0,
        scale: 1,
        skewX: 0,
        opacity: 1,
        ease: 'power2.out',
      });
    }
    
    gsap.fromTo(
      target,
      {
        color: hoverColor,
        textShadow: '0 0 12px rgba(34,211,238,0.8)'
      },
      {
        duration: 1.2,
        delay: 0.1,
        color: '#f1f5f9', // slate-100
        textShadow: '0 0 0px rgba(34,211,238,0)',
        ease: 'power2.out',
      }
    );
  };

  const handleHeroMouseMove = (event) => {
    if (prefersReducedMotion) return;
    const letterEl = event.target.closest('[data-letter-index]');
    const nextIndex = letterEl ? Number(letterEl.dataset.letterIndex) : null;

    if (nextIndex == null || Number.isNaN(nextIndex)) {
      if (activeLetterRef.current != null) {
        handleLetterLeave(activeLetterRef.current);
        activeLetterRef.current = null;
      }
      return;
    }

    if (activeLetterRef.current === nextIndex) return;

    if (activeLetterRef.current != null) {
      handleLetterLeave(activeLetterRef.current);
    }

    handleLetterEnter(nextIndex);
    activeLetterRef.current = nextIndex;
  };

  const handleHeroMouseLeave = () => {
    if (activeLetterRef.current != null) {
      handleLetterLeave(activeLetterRef.current);
      activeLetterRef.current = null;
    }
  };

  const handleLoginButtonEnter = () => {
    if (prefersReducedMotion || isSubmitting || !loginButtonRef.current) return;
    gsap.to(loginButtonRef.current, {
      y: -2,
      scale: 1.02,
      boxShadow: '0 18px 34px rgba(90, 143, 186, 0.42)',
      duration: 0.3,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  };

  const handleLoginButtonLeave = () => {
    if (!loginButtonRef.current || isSubmitting) return;
    gsap.to(loginButtonRef.current, {
      y: 0,
      scale: 1,
      boxShadow: '0 12px 24px rgba(120, 164, 199, 0.34)',
      duration: 0.4,
      ease: 'power2.out',
    });
  };

  const handleLoginButtonPress = () => {
    if (prefersReducedMotion || isSubmitting || !loginButtonRef.current) return;
    gsap.to(loginButtonRef.current, {
      scale: 0.96,
      y: 1,
      boxShadow: '0 4px 12px rgba(120, 164, 199, 0.2)',
      duration: 0.15,
      ease: 'power2.out',
    });
  };

  const handleLoginButtonRelease = () => {
    if (prefersReducedMotion || isSubmitting || !loginButtonRef.current) return;
    gsap.to(loginButtonRef.current, {
      y: -2,
      scale: 1.02,
      duration: 0.34,
      ease: 'elastic.out(1, 0.6)',
      overwrite: 'auto',
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] p-5 sm:p-8 flex items-center justify-center">
      {/* Subtle animated particles overlay for monitoring aesthetic */}
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] opacity-20 pointer-events-none" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)] pointer-events-none" />

      <div className="relative z-20 w-full max-w-7xl">
        <motion.div
          className="relative w-full rounded-3xl bg-[#0a0f18]/80 backdrop-blur-xl p-3 shadow-[0_0_60px_rgba(0,0,0,0.8)] border border-cyan-500/20 sm:p-4"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.3 }}
        >
          <div className="grid min-h-[720px] grid-cols-1 gap-4 lg:grid-cols-2">
            <section
              ref={mediaPanelRef}
              className="relative hidden overflow-hidden rounded-[1.5rem] bg-[#020617] border border-cyan-500/20 lg:block shadow-[inset_0_0_40px_rgba(6,182,212,0.1)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.15),transparent_60%)] z-10" />
              
              {/* Caustic Reflection Overlay */}
              <div className="caustic-bg" />

              {/* Radar Graphic replacing the video */}
              <div
                ref={mediaVideoRef}
                className="pointer-events-none absolute inset-0 flex items-center justify-center scale-110 opacity-70 z-10"
              >
                {/* Background Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.07)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
                
                {/* Radar Rings */}
                <div className="absolute w-[140%] aspect-square rounded-full border border-cyan-500/10" />
                <div className="absolute w-[105%] aspect-square rounded-full border border-cyan-500/15" />
                <div className="absolute w-[70%] aspect-square rounded-full border border-cyan-500/20" />
                <div className="absolute w-[35%] aspect-square rounded-full border border-cyan-500/30 bg-cyan-500/5" />
                
                {/* Radar Crosshairs */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-[1px] bg-cyan-500/20" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-full w-[1px] bg-cyan-500/20" />
                </div>

                {/* Sweeping Scanner */}
                <div className="absolute w-[105%] aspect-square rounded-full overflow-hidden">
                  <div className="absolute inset-0 origin-center rounded-full bg-[conic-gradient(from_0deg,transparent_75%,rgba(34,211,238,0.3)_100%)] animate-[spin_4s_linear_infinite]" />
                  <div className="absolute top-0 bottom-1/2 left-1/2 w-[1px] origin-bottom bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-[spin_4s_linear_infinite]" />
                </div>

                {/* Blips */}
                <div className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] top-[30%] left-[65%] sonar-pulse" />
                <div className="absolute w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_12px_#fb7185] top-[55%] left-[30%] sonar-pulse" />
                <div className="absolute w-1 h-1 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee] top-[70%] left-[75%] sonar-pulse" style={{ animationDelay: '1s' }} />
              </div>

              <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#020617] via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-10 left-10 z-30 text-white font-sans pointer-events-none leading-tight">
                <p className="font-mono font-bold tracking-[0.2em] text-3xl sm:text-4xl uppercase text-slate-200">
                  RIPPLE.<br />
                  <span className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]"></span>SIGNAL. RESCUE.
                </p>
                <p className="mt-3 text-sm sm:text-base font-mono tracking-widest uppercase text-cyan-400/80">
                  AI-Powered Drowning Detection System
                </p>
              </div>
            </section>

            <section ref={formPanelRef} className="flex flex-col justify-center rounded-[1.5rem] bg-transparent px-5 sm:px-8 py-10 lg:px-16">
              <div className="mb-8 flex flex-col items-center text-center">
                <div data-intro-item className="inline-flex h-11 w-11 items-center justify-center rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(6,182,212,0.2)]">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0l5.65-5.66zm0-2.83L4.93 6.93a10 10 0 1 0 14.14 0L12-.14z" />
                    <path d="M12 8a4 4 0 0 0-4 4c0 .55.45 1 1 1s1-.45 1-1a2 2 0 0 1 2-2c.55 0 1-.45 1-1s-.45-1-1-1z" />
                  </svg>
                </div>
                <h1
                  data-intro-item
                  className="mt-5 text-[22px] sm:text-[32px] font-mono font-bold tracking-[0.2em] uppercase text-slate-100 whitespace-nowrap"
                  onMouseMove={handleHeroMouseMove}
                  onMouseLeave={handleHeroMouseLeave}
                >
                  {welcomeLetters.map((char, index) => (
                    <span
                      key={`${char}-${index}`}
                      ref={(el) => {
                        letterRefs.current[index] = el;
                      }}
                      data-letter-index={char === ' ' ? undefined : index}
                      className={char === ' ' ? 'inline-block w-[0.22em]' : 'inline-block cursor-default select-none'}
                    >
                      {char === ' ' ? '\u00A0' : char}
                    </span>
                  ))}
                </h1>
                <p data-intro-item className="mt-2 text-xs font-mono tracking-wider uppercase text-slate-500">
                  Authenticate to access system terminal
                </p>
              </div>

              {(authError || fieldError) && (
                <motion.div
                  role="alert"
                  className="mb-5 rounded border border-rose-500/50 bg-rose-950/50 p-3 text-xs font-mono tracking-wider uppercase text-rose-400"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {fieldError || authError}
                </motion.div>
              )}

              <form data-intro-item onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="group relative">
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Username"
                    className="peer w-full rounded border border-slate-800 bg-slate-900/80 pl-5 pr-5 pb-2 pt-6 text-slate-200 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition-all duration-300 placeholder-transparent focus:bg-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                  <label
                    htmlFor="username"
                    className="absolute left-5 top-4 z-10 origin-[0] -translate-y-2.5 scale-75 transform text-xs font-mono font-bold tracking-wider uppercase text-slate-500 transition-all duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 cursor-text peer-focus:text-cyan-400"
                  >
                    Username
                  </label>
                </div>

                <div className="group relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Password"
                    className="peer w-full rounded border border-slate-800 bg-slate-900/80 pl-5 pr-12 pb-2 pt-6 text-slate-200 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition-all duration-300 placeholder-transparent focus:bg-slate-900 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                  <label
                    htmlFor="password"
                    className="absolute left-5 top-4 z-10 origin-[0] -translate-y-2.5 scale-75 transform text-xs font-mono font-bold tracking-wider uppercase text-slate-500 transition-all duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 cursor-text peer-focus:text-cyan-400"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded p-1 text-slate-500 transition-colors hover:text-cyan-400"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="flex items-center pt-2">
                  <label htmlFor="rememberMe" className="inline-flex cursor-pointer select-none items-center gap-3 text-slate-400 transition-colors hover:text-cyan-400">
                    <div className="relative flex items-center">
                      <input
                        id="rememberMe"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isSubmitting}
                        className="peer h-4 w-4 appearance-none rounded-sm border border-slate-700 bg-slate-900 transition-all checked:border-cyan-500 checked:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-1 focus:ring-offset-[#0a0f18]"
                      />
                      <svg className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-cyan-400 opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 8 6 11 13 4" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-mono font-bold tracking-wider uppercase">Remember session</span>
                  </label>
                </div>

                <div className="flex justify-center pt-2">
                  <motion.button
                    ref={loginButtonRef}
                    type="submit"
                    aria-label="Sign In"
                    disabled={isSubmitting}
                    onMouseEnter={handleLoginButtonEnter}
                    onMouseLeave={handleLoginButtonLeave}
                    onMouseDown={handleLoginButtonPress}
                    onMouseUp={handleLoginButtonRelease}
                    initial={false}
                    animate={{
                      width: isSubmitting ? "3.5rem" : "100%",
                      borderRadius: isSubmitting ? "50%" : "0.25rem",
                    }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    style={{
                      boxShadow: isSubmitting ? "none" : undefined,
                    }}
                    className={`relative flex h-[3.5rem] items-center justify-center border px-5 py-4 text-sm font-mono font-bold tracking-widest uppercase transition-all duration-300 ${
                      isSubmitting 
                        ? 'overflow-visible cursor-wait before:opacity-0 after:opacity-0 border-transparent bg-transparent bg-none shadow-none text-transparent' 
                        : 'overflow-hidden border-cyan-500/50 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(6,182,212,0.15)] hover:bg-cyan-500/20 hover:border-cyan-400'
                    }`}
                  >
                    <motion.span
                      className="absolute whitespace-nowrap"
                      initial={false}
                      animate={{
                        opacity: isSubmitting ? 0 : 1,
                        scale: isSubmitting ? 0.8 : 1,
                      }}
                      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                      Connect to System
                    </motion.span>
                    
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      initial={false}
                      animate={{
                        opacity: isSubmitting ? 1 : 0,
                        scale: isSubmitting ? 1 : 0.8,
                      }}
                      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    >
                      {isSubmitting && (
                        <div ref={customLoaderRef} className="h-8 w-8 text-cyan-400">
                          <svg className="h-full w-full drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" viewBox="0 0 50 50" fill="none">
                            <circle cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="opacity-25" />
                            <path d="M 25 5 A 20 20 0 0 1 45 25" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}
                    </motion.div>
                  </motion.button>
                </div>

                <motion.p
                  className="text-center text-[10px] font-mono font-bold tracking-widest uppercase text-cyan-400/80"
                  initial={false}
                  animate={{
                    opacity: submitState === 'loading' ? 1 : 0,
                    y: submitState === 'loading' ? 0 : -4,
                    height: submitState === 'loading' ? 'auto' : 0,
                  }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.25, ease: 'easeOut' }}
                >
                  Authenticating secure connection...
                </motion.p>
              </form>
            </section>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default LoginPage;
