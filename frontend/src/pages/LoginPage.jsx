/**
 * AquaGuard — Login Page.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { useAuth } from '../context/AuthContext.jsx';
import lifeguardVideo from '../vector/lifeguard.mp4';
import bubblesImage from '../vector/bubbles.png';

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
  const letterRefs = useRef([]);
  const activeLetterRef = useRef(null);
  const letterLockRef = useRef(new Set());
  const letterUnlockTimersRef = useRef({});
  const loginButtonRef = useRef(null);
  const formPanelRef = useRef(null);
  const mediaPanelRef = useRef(null);
  const mediaVideoRef = useRef(null);
  const bubblesRef = useRef(null);
  const customLoaderRef = useRef(null);
  const welcomeText = 'WELCOME BACK';
  const welcomeLetters = welcomeText.split('');
  const hoverPalette = ['#a3cef1', '#bfdbfe', '#93c5fd', '#60a5fa'];

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
      if (bubblesRef.current) gsap.killTweensOf(bubblesRef.current);
      Object.values(letterUnlockTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    },
    []
  );

  useEffect(() => {
    if (prefersReducedMotion) return undefined;

    const handleGlobalMouseMove = (event) => {
      if (!mediaVideoRef.current || !bubblesRef.current) return;

      const offsetX = (event.clientX / window.innerWidth - 0.5) * 2;
      const offsetY = (event.clientY / window.innerHeight - 0.5) * 2;

      gsap.to(mediaVideoRef.current, {
        x: offsetX * 14,
        y: offsetY * 6,
        duration: 0.6,
        ease: 'power3.out',
        overwrite: 'auto',
      });

      gsap.to(bubblesRef.current, {
        x: offsetX * -26,
        y: offsetY * -12,
        duration: 0.75,
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
      if (bubblesRef.current) {
        gsap.to(bubblesRef.current, {
          x: 0,
          y: 0,
          duration: 0.8,
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

    if (bubblesRef.current) {
      gsap.set(bubblesRef.current, { autoAlpha: 0, y: -14 });
      tl.to(bubblesRef.current, { autoAlpha: 1, y: 0, duration: 0.55 }, 0);
    }

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
    const hoverColor = hoverPalette[Math.floor(Math.random() * hoverPalette.length)];
    target.dataset.hoverColor = hoverColor;
    letterLockRef.current.add(index);

    gsap.killTweensOf(target);
    gsap.set(target, { color: hoverColor });
    gsap.set(target, { y: -4.8, rotation: -12 }); // always start from left
    gsap.to(target, {
      keyframes: [
        { rotation: 11, y: 3.2, duration: 0.24, ease: 'sine.inOut' },
        { rotation: -9, y: -2.8, duration: 0.24, ease: 'sine.inOut' },
        { rotation: 8.5, y: 2.3, duration: 0.24, ease: 'sine.inOut' },
        { rotation: -7, y: -2.1, duration: 0.24, ease: 'sine.inOut' },
        { rotation: 6.5, y: 1.7, duration: 0.24, ease: 'sine.inOut' },
        { rotation: -5, y: -1.4, duration: 0.24, ease: 'sine.inOut' },
        { rotation: 4.5, y: 1, duration: 0.24, ease: 'sine.inOut' },
        { rotation: -3, y: -0.8, duration: 0.24, ease: 'sine.inOut' },
        { rotation: 0, y: 0, duration: 0.3, ease: 'power2.out' },
      ],
    });
    gsap.to(target, {
      duration: 0.28,
      scale: 1.03,
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut',
    });

    if (letterUnlockTimersRef.current[index]) {
      clearTimeout(letterUnlockTimersRef.current[index]);
    }
    letterUnlockTimersRef.current[index] = setTimeout(() => {
      letterLockRef.current.delete(index);
      delete letterUnlockTimersRef.current[index];
    }, 2350);
  };

  const handleLetterLeave = (index) => {
    const target = letterRefs.current[index];
    if (!target) return;
    const hoverColor = target.dataset.hoverColor || '#a3cef1';

    if (!letterLockRef.current.has(index)) {
      gsap.killTweensOf(target);
      gsap.to(target, {
        duration: 1.45,
        y: 0,
        rotation: 0,
        ease: 'power2.out',
      });
    }
    gsap.fromTo(
      target,
      {
        color: hoverColor,
      },
      {
        duration: 2.1,
        delay: 0.2,
        color: '#0f172a',
        ease: 'sine.out',
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
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-sky-100 p-5 sm:p-8">
      <div className="relative z-20 flex min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <motion.div
          className="relative w-full max-w-7xl rounded-[2rem] bg-white p-3 shadow-2xl sm:p-4"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.3 }}
        >
          <img
            ref={bubblesRef}
            src={bubblesImage}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 left-0 z-30 hidden w-[58%] max-w-[720px] lg:block"
          />
          <div className="grid min-h-[720px] grid-cols-1 gap-4 lg:grid-cols-2">
            <section
              ref={mediaPanelRef}
              className="relative hidden overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#e7ecef] via-[#d8e8f7] to-[#a3cef1]/80 lg:block"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.55),transparent_44%)]" />
              <video
                ref={mediaVideoRef}
                src={lifeguardVideo}
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
                disableRemotePlayback
                controlsList="nofullscreen nodownload noremoteplayback"
                className="pointer-events-none absolute inset-0 h-full w-full scale-[1.08] object-cover object-center"
              />
              <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
              <div className="absolute bottom-10 left-10 z-20 text-white font-sans font-black tracking-widest text-3xl sm:text-4xl uppercase pointer-events-none leading-tight">
                RIPPLE.<br />
                <span className="text-[#a3cef1]"></span>SIGNAL. RESCUE.
              </div>
            </section>

            <section ref={formPanelRef} className="flex flex-col justify-center rounded-[1.5rem] bg-white px-8 py-10 lg:px-16">
              <div className="mb-8 flex flex-col items-center text-center">
                <div data-intro-item className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0l5.65-5.66zm0-2.83L4.93 6.93a10 10 0 1 0 14.14 0L12-.14z" />
                    <path d="M12 8a4 4 0 0 0-4 4c0 .55.45 1 1 1s1-.45 1-1a2 2 0 0 1 2-2c.55 0 1-.45 1-1s-.45-1-1-1z" />
                  </svg>
                </div>
                <h1
                  data-intro-item
                  className="mt-5 text-[34px] font-extrabold tracking-tight text-slate-900"
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
                <p data-intro-item className="mt-2 text-sm text-slate-500">
                  Enter your username and password to access your account.
                </p>
              </div>

              {(authError || fieldError) && (
                <motion.div
                  role="alert"
                  className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
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
                    className="peer w-full rounded-2xl border border-transparent bg-[#e7ecef]/50 pl-5 pr-5 pb-2 pt-6 text-slate-900 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-all duration-300 placeholder-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#a3cef1] focus:shadow-sm"
                  />
                  <label
                    htmlFor="username"
                    className="absolute left-5 top-4 z-10 origin-[0] -translate-y-2.5 scale-75 transform text-sm text-slate-500 transition-all duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 cursor-text"
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
                    className="peer w-full rounded-2xl border border-transparent bg-[#e7ecef]/50 pl-5 pr-12 pb-2 pt-6 text-slate-900 font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-all duration-300 placeholder-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#a3cef1] focus:shadow-sm"
                  />
                  <label
                    htmlFor="password"
                    className="absolute left-5 top-4 z-10 origin-[0] -translate-y-2.5 scale-75 transform text-sm text-slate-500 transition-all duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-2.5 peer-focus:scale-75 cursor-text"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 rounded-xl p-1 text-slate-500 transition-colors hover:text-slate-700"
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

                <div className="flex items-center pt-2 text-sm">
                  <label htmlFor="rememberMe" className="inline-flex cursor-pointer select-none items-center gap-3 text-slate-600 transition-colors hover:text-slate-800">
                    <div className="relative flex items-center">
                      <input
                        id="rememberMe"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isSubmitting}
                        className="peer h-5 w-5 appearance-none rounded-md border-2 border-slate-300 bg-white transition-all checked:border-[#a3cef1] checked:bg-[#a3cef1] focus:outline-none focus:ring-2 focus:ring-[#a3cef1] focus:ring-offset-1"
                      />
                      <svg className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 8 6 11 13 4" />
                      </svg>
                    </div>
                    <span className="font-medium">Remember me</span>
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
                      borderRadius: isSubmitting ? "50%" : "1.5rem",
                    }}
                    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    style={{
                      boxShadow: isSubmitting ? "none" : undefined,
                    }}
                    className={`relative flex h-[3.5rem] items-center justify-center border px-5 py-4 text-sm font-semibold tracking-[0.02em] transition-all duration-300 before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(120deg,transparent_10%,rgba(255,255,255,0.5)_50%,transparent_88%)] before:transition-opacity before:duration-300 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-[1px] after:bg-white/70 ${
                      isSubmitting 
                        ? 'overflow-visible cursor-wait before:opacity-0 after:opacity-0 border-transparent bg-transparent bg-none shadow-none text-transparent' 
                        : 'overflow-hidden hover:before:opacity-100 before:opacity-0 border-[#8ebde3] bg-[linear-gradient(135deg,#d7eafb_0%,#b9d9f5_42%,#a3cef1_78%,#93c4ee_100%)] text-slate-900 shadow-[0_12px_24px_rgba(120,164,199,0.34)]'
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
                      Login
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
                        <div ref={customLoaderRef} className="h-8 w-8 text-[#06b6d4]">
                          <svg className="h-full w-full drop-shadow-md" viewBox="0 0 50 50" fill="none">
                            <circle cx="25" cy="25" r="20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className="opacity-25" />
                            <path d="M 25 5 A 20 20 0 0 1 45 25" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}
                    </motion.div>
                  </motion.button>
                </div>

                <motion.p
                  className="text-center text-sm text-slate-500"
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
