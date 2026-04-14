/**
 * AquaGuard Frontend - Framer Motion Animation Presets
 * 
 * Standard animation patterns for consistent motion design across the application.
 * All animations respect user's prefers-reduced-motion setting.
 */

/**
 * Fade In Animation
 * Use for: Simple element appearances, modal overlays
 */
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: 'easeOut' }
};

/**
 * Slide Up Animation
 * Use for: Cards entering from bottom, page transitions
 */
export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3, ease: 'easeOut' }
};

/**
 * Slide Down Animation
 * Use for: Dropdowns, notifications from top
 */
export const slideDown = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.2, ease: 'easeOut' }
};

/**
 * Scale In Animation
 * Use for: Modals, popovers, alerts
 */
export const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.9, opacity: 0 },
  transition: { 
    type: 'spring', 
    damping: 20, 
    stiffness: 300 
  }
};

/**
 * Scale and Fade
 * Use for: Button presses, interactive feedback
 */
export const scaleAndFade = {
  initial: { scale: 0.95, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 1.05, opacity: 0 },
  transition: { duration: 0.2 }
};

/**
 * Stagger Container
 * Use for: Parent container of list items
 */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05
    }
  }
};

/**
 * Stagger Item
 * Use for: Individual items in a staggered list
 */
export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' }
  }
};

/**
 * Shake Animation (for alerts)
 * Use for: Critical alerts, error states
 */
export const shake = {
  initial: { x: 0 },
  animate: { 
    x: [0, -4, 4, -4, 4, 0],
    transition: { duration: 0.5 }
  }
};

/**
 * Pulse Animation (for attention)
 * Use for: Live indicators, notification badges
 */
export const pulse = {
  animate: {
    scale: [1, 1.05, 1],
    opacity: [1, 0.8, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  }
};

/**
 * Hover Lift
 * Use for: Cards, interactive elements
 */
export const hoverLift = {
  whileHover: { 
    y: -4,
    transition: { type: 'spring', stiffness: 300, damping: 20 }
  }
};

/**
 * Hover Scale
 * Use for: Buttons, small interactive elements
 */
export const hoverScale = {
  whileHover: { 
    scale: 1.02,
    transition: { type: 'spring', stiffness: 400, damping: 17 }
  },
  whileTap: { scale: 0.98 }
};

/**
 * Page Transition
 * Use for: Page route changes
 */
export const pageTransition = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { 
    duration: 0.3, 
    ease: [0.43, 0.13, 0.23, 0.96] // Custom easing
  }
};

/**
 * Alert Entry (Critical)
 * Use for: Drowning detection alerts
 */
export const alertEntry = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { 
    scale: 1, 
    opacity: 1,
    rotate: [0, -2, 2, -2, 0],  // Shake on entry
    transition: {
      scale: { type: 'spring', damping: 15 },
      rotate: { duration: 0.5 }
    }
  }
};

/**
 * Layout Animation Config
 * Use with layoutId for smooth position changes
 */
export const layoutTransition = {
  layout: true,
  transition: {
    type: 'spring',
    stiffness: 300,
    damping: 30
  }
};

/**
 * Slide Horizontal
 * Use for: Sidebar, drawers
 */
export const slideRight = {
  initial: { x: -100, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: -100, opacity: 0 },
  transition: { duration: 0.3, ease: 'easeOut' }
};

export const slideLeft = {
  initial: { x: 100, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: 100, opacity: 0 },
  transition: { duration: 0.3, ease: 'easeOut' }
};

/**
 * Helper function to combine animation variants
 */
export const combineVariants = (...variants) => {
  return variants.reduce((acc, variant) => ({
    ...acc,
    ...variant
  }), {});
};

/**
 * Helper to create stagger delay
 */
export const staggerDelay = (index, baseDelay = 0.05) => ({
  transition: { delay: index * baseDelay }
});

/**
 * Reduced Motion Check
 * Use to respect user's accessibility preferences
 */
export const useReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Safe Animation Wrapper
 * Automatically disables animations if user prefers reduced motion
 */
export const safeAnimation = (animation) => {
  const shouldReduce = useReducedMotion();
  if (shouldReduce) {
    // Return instant transitions
    return {
      initial: animation.animate,
      animate: animation.animate,
      transition: { duration: 0.01 }
    };
  }
  return animation;
};
