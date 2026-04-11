# AquaGuard Frontend Redesign — Enhanced Design System

This document contains the complete plan for redesigning the AquaGuard frontend
with a **Modern Minimalist Professional Theme**. Any agent working on frontend 
tasks must follow this design system.

---

## 1. Vision & Philosophy

Transform AquaGuard into a **world-class safety monitoring platform** that combines:
- **Professional aesthetics** - Clean, minimalist, institutional-grade design
- **Intuitive interactions** - Micro-animations that guide user attention
- **Visual hierarchy** - Clear information prioritization for safety-critical decisions
- **Responsive excellence** - Flawless experience across all devices
- **Accessibility first** - WCAG 2.1 AA compliant

### Core Design Principles
1. **Clarity over decoration** - Every visual element serves a purpose
2. **Instant comprehension** - Status should be understood at a glance
3. **Responsive to urgency** - Visual language escalates with alert severity
4. **Consistent interactions** - Predictable behavior across all components
5. **Performance matters** - Smooth 60fps animations, optimized rendering

### Design Direction Evolution
- **From:** Ocean theme with decorative elements
- **To:** Sophisticated dark mode with purposeful accent colors
- Surgical use of color for status communication
- Geometric precision with subtle rounded corners
- Elevated glassmorphism with depth and shadow
- Data-driven microinteractions
- Professional motion design

---

## 2. Enhanced Color System

### Primary Palette (Sophisticated Dark)

| Role | Name | Hex | RGB | Tailwind | Usage |
|------|------|-----|-----|----------|-------|
| **Backgrounds** |
| Deep | Charcoal | `#0f172a` | `15, 23, 42` | `bg-slate-900` | Main background |
| Surface | Slate | `#1e293b` | `30, 41, 59` | `bg-slate-800` | Cards, elevated surfaces |
| Elevated | Steel | `#334155` | `51, 65, 85` | `bg-slate-700` | Hover states, active |
| **Accents** |
| Primary | Cyan | `#06b6d4` | `6, 182, 212` | `bg-cyan-500` | Primary actions, links |
| Success | Emerald | `#10b981` | `16, 185, 129` | `bg-emerald-500` | Online, success states |
| Warning | Amber | `#f59e0b` | `245, 158, 11` | `bg-amber-500` | Warnings, degraded |
| Danger | Rose | `#f43f5e` | `244, 63, 94` | `bg-rose-500` | Alerts, errors, critical |
| Info | Blue | `#3b82f6` | `59, 130, 246` | `bg-blue-500` | Information, neutral |
| **Text** |
| Primary | White | `#f8fafc` | `248, 250, 252` | `text-slate-50` | Headings, primary content |
| Secondary | Silver | `#cbd5e1` | `203, 213, 225` | `text-slate-300` | Body text, labels |
| Tertiary | Gray | `#94a3b8` | `148, 163, 184` | `text-slate-400` | Captions, metadata |
| Disabled | Muted | `#64748b` | `100, 116, 139` | `text-slate-500` | Disabled states |

### Semantic Color Application

```css
/* Status Colors */
--status-online: #10b981;      /* Emerald-500 - Active, healthy */
--status-degraded: #f59e0b;    /* Amber-500 - Warning, reduced performance */
--status-offline: #64748b;     /* Slate-500 - Inactive, disconnected */
--status-alert: #f43f5e;       /* Rose-500 - Critical, requires action */

/* Interactive States */
--hover-overlay: rgba(255, 255, 255, 0.05);
--active-overlay: rgba(255, 255, 255, 0.1);
--focus-ring: rgba(6, 182, 212, 0.5);  /* Cyan with transparency */
--selection-bg: rgba(6, 182, 212, 0.2);
```

### Gradient Definitions (Refined)

```css
/* Subtle background gradients */
--gradient-dark: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
--gradient-surface: linear-gradient(135deg, #1e293b 0%, #334155 100%);

/* Accent gradients for emphasis */
--gradient-primary: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
--gradient-success: linear-gradient(135deg, #10b981 0%, #059669 100%);
--gradient-danger: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);

/* Glass effect gradient overlay */
--glass-gradient: linear-gradient(
  135deg,
  rgba(255, 255, 255, 0.1) 0%,
  rgba(255, 255, 255, 0.05) 100%
);
```

---

## 3. Typography System

### Font Stack (Professional)
```css
/* System font stack - native, fast, professional */
--font-sans: 'Inter var', ui-sans-serif, system-ui, -apple-system, 
             BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

/* Monospace for data, code, metrics */
--font-mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', 
             'Source Code Pro', monospace;

/* Display font for hero elements (optional) */
--font-display: 'Cal Sans', 'Inter var', sans-serif;
```

### Type Scale (Modular 1.25 ratio)

| Level | Size | Line Height | Weight | Usage | Tailwind |
|-------|------|-------------|--------|-------|----------|
| **Display** | 3rem (48px) | 1.1 | 700 | Hero headings | `text-5xl font-bold` |
| **H1** | 2.25rem (36px) | 1.2 | 700 | Page titles | `text-4xl font-bold` |
| **H2** | 1.875rem (30px) | 1.3 | 600 | Section headings | `text-3xl font-semibold` |
| **H3** | 1.5rem (24px) | 1.4 | 600 | Subsections | `text-2xl font-semibold` |
| **H4** | 1.25rem (20px) | 1.4 | 500 | Card titles | `text-xl font-medium` |
| **Body Large** | 1.125rem (18px) | 1.6 | 400 | Emphasis text | `text-lg` |
| **Body** | 1rem (16px) | 1.6 | 400 | Default text | `text-base` |
| **Body Small** | 0.875rem (14px) | 1.5 | 400 | Supporting text | `text-sm` |
| **Caption** | 0.75rem (12px) | 1.4 | 500 | Labels, metadata | `text-xs font-medium` |

### Text Color Utilities

```css
/* Semantic text colors */
.text-primary { color: #f8fafc; }     /* Headings, important */
.text-secondary { color: #cbd5e1; }   /* Body text */
.text-tertiary { color: #94a3b8; }    /* Captions, less important */
.text-disabled { color: #64748b; }    /* Disabled states */
.text-link { color: #06b6d4; }        /* Interactive links */
```

### Font Weight Guidelines
- **700 (Bold)** - Page headings, numbers with high importance
- **600 (Semibold)** - Section headers, card titles
- **500 (Medium)** - Labels, captions, emphasized UI text
- **400 (Regular)** - Body copy, descriptions
- **300 (Light)** - Minimal use, large display numbers only

---

## 4. Elevated Glassmorphism & Depth System

### Glass Card Variants

**Level 1 - Subtle Glass (Default cards)**
```css
.glass-subtle {
  background: rgba(30, 41, 59, 0.7);          /* slate-800 with 70% opacity */
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -2px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.05);
}
```

**Level 2 - Prominent Glass (Interactive cards, modals)**
```css
.glass-prominent {
  background: rgba(51, 65, 85, 0.8);          /* slate-700 with 80% opacity */
  backdrop-filter: blur(24px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 
    0 10px 15px -3px rgba(0, 0, 0, 0.4),
    0 4px 6px -4px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.05);
}
```

**Level 3 - Elevated Glass (Popovers, dropdowns)**
```css
.glass-elevated {
  background: rgba(51, 65, 85, 0.95);
  backdrop-filter: blur(32px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  box-shadow: 
    0 20px 25px -5px rgba(0, 0, 0, 0.5),
    0 8px 10px -6px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.15);
}
```

### Shadow System (Consistent elevation)

```css
/* Tailwind shadow scale - use consistently */
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.25);
--shadow-base: 0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.3);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.4);
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.6);
```

### Border Radius System

| Element | Radius | Tailwind | Usage |
|---------|--------|----------|-------|
| Buttons (small) | 8px | `rounded-lg` | Small buttons, badges |
| Cards | 12px | `rounded-xl` | Default cards, inputs |
| Panels | 16px | `rounded-2xl` | Large panels, modals |
| Full round | 9999px | `rounded-full` | Avatar, status dots |

### Interactive States

```css
/* Hover overlay */
.hover-overlay {
  position: relative;
}
.hover-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.05);
  opacity: 0;
  transition: opacity 200ms ease;
}
.hover-overlay:hover::before {
  opacity: 1;
}

/* Focus ring - always visible for accessibility */
.focus-ring {
  outline: 2px solid rgba(6, 182, 212, 0.5);
  outline-offset: 2px;
}
```

---

## 5. Component Specifications (Enhanced)

### 5.1 Sidebar Navigation (Refined)

**Structure:**
```
┌─────────────────────────┐
│                         │
│    ⬡  AquaGuard         │  ← Logo: geometric icon + wordmark
│    ─────────────        │     Cyan accent on dark
│                         │
├─────────────────────────┤
│                         │
│  ◉  Dashboard           │  ← Active: cyan bg + border-l-2
│  ○  Incidents           │     Icon + label, clean spacing
│  ○  Analytics           │  
│  ○  System              │  ← Inactive: slate-400, hover: white
│                         │
├─────────────────────────┤
│                         │
│  ● Online   ● Offline   │  ← System status dots
│  v2.0.0                 │  ← Version (tertiary text)
│                         │
└─────────────────────────┘
```

**Styling Specifications:**
```javascript
// Sidebar Container
className="
  w-64 h-screen bg-slate-900 
  border-r border-slate-800 
  flex flex-col
"

// Logo Section
className="
  px-6 py-6 border-b border-slate-800
  flex items-center gap-3
"

// Logo Icon (Geometric hexagon)
<svg className="w-8 h-8 text-cyan-500">
  <path d="M12 2l10 5.5v11L12 24 2 18.5v-11z" />
</svg>

// Nav Item (Active)
className="
  flex items-center gap-3 px-6 py-3
  bg-cyan-500/10 border-l-2 border-cyan-500
  text-cyan-400 font-medium
  transition-all duration-200
"

// Nav Item (Inactive)
className="
  flex items-center gap-3 px-6 py-3
  text-slate-400 font-medium
  hover:text-slate-50 hover:bg-white/5
  transition-all duration-200
"

// Icons: Heroicons 2.0, 20x20, strokeWidth={1.5}
```

**Interactions:**
- Click: Instant navigation (no loader needed)
- Hover: Smooth color transition (200ms)
- Active: Left border slides in from left (100ms)
- Logo: Subtle scale on hover (1.02)

### 5.2 Camera Card (Redesigned)

**Visual Hierarchy:**
```
┌───────────────────────────────────┐
│ ┌─────────┐  Zone Dev   ● LIVE   │  ← Header: name + status
│ │ [VIDEO] │                       │
│ │  FEED   │  FPS: 30    1920×1080 │  ← Metrics bar
│ └─────────┘                       │
│                                   │
│ ◉ 2 Detections  ◉ Healthy        │  ← Quick stats
│                                   │
│ [ View Details → ]                │  ← Primary action
└───────────────────────────────────┘
```

**Styling:**
```jsx
<motion.div
  className="
    glass-subtle rounded-xl overflow-hidden
    border border-white/10
    transition-shadow duration-200
  "
  whileHover={{
    y: -4,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)'
  }}
>
  {/* Header */}
  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
    <h3 className="text-lg font-semibold text-slate-50">{name}</h3>
    <StatusBadge status={status} />
  </div>

  {/* Video feed */}
  <div className="relative aspect-video bg-slate-950">
    <img src={streamUrl} className="w-full h-full object-cover" />
    {isLive && (
      <div className="absolute top-2 right-2">
        <LiveIndicator />
      </div>
    )}
  </div>

  {/* Metrics bar */}
  <div className="px-4 py-2 bg-slate-800/50 flex gap-4 text-sm">
    <span className="text-slate-400">
      FPS: <span className="text-slate-50 font-mono">{fps}</span>
    </span>
    <span className="text-slate-400">
      Res: <span className="text-slate-50 font-mono">{resolution}</span>
    </span>
  </div>

  {/* Footer */}
  <div className="px-4 py-3 flex justify-between items-center">
    <div className="flex gap-3">
      <StatPill icon="👤" value={detections} label="Detections" />
      <HealthIndicator health={health} />
    </div>
    <button className="btn-ghost-sm">View Details →</button>
  </div>
</motion.div>
```

**Status Badge Component:**
```jsx
const StatusBadge = ({ status }) => {
  const variants = {
    live: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    offline: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    alert: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
  };

  return (
    <span className={`
      px-2 py-1 rounded-lg border text-xs font-medium
      ${variants[status]}
    `}>
      {status.toUpperCase()}
    </span>
  );
};
```

### 5.3 Alert Panel (Critical Redesign)

**Two Alert Modes:**

**Mode 1: Banner (Non-critical warnings)**
```
┌──────────────────────────────────────────┐
│ ⚠  Camera Zone-2 connection degraded     │  ← Top banner
│    [Dismiss]                              │
└──────────────────────────────────────────┘
```

**Mode 2: Full Screen (DROWNING DETECTED)**
```
┌──────────────────────────────────────────┐
│                                          │
│        🚨 DROWNING DETECTED              │  ← Huge, centered
│                                          │
│   Zone: Pool Area (Camera 3)             │
│   Time: 16:34:22                         │
│   Confidence: 94%                        │
│                                          │
│   [ ✓ ACKNOWLEDGE (A) ]                  │  ← Keyboard shortcut
│   [   View Footage    ]                  │
│                                          │
└──────────────────────────────────────────┘
```

**Full Screen Alert Styling:**
```jsx
<motion.div
  className="
    fixed inset-0 z-50
    bg-gradient-to-br from-rose-950/95 to-slate-900/95
    backdrop-blur-xl
    flex items-center justify-center
  "
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ 
    opacity: 1, 
    scale: 1,
    transition: { type: 'spring', damping: 15 }
  }}
>
  {/* Pulsing glow effect */}
  <div className="absolute inset-0 animate-pulse-slow">
    <div className="absolute inset-0 bg-rose-500/10" />
  </div>

  {/* Content card */}
  <motion.div
    className="
      relative z-10 max-w-2xl mx-auto p-12
      glass-elevated rounded-2xl
      border-2 border-rose-500/50
    "
    animate={{
      boxShadow: [
        '0 0 30px rgba(244, 63, 94, 0.3)',
        '0 0 60px rgba(244, 63, 94, 0.5)',
        '0 0 30px rgba(244, 63, 94, 0.3)'
      ]
    }}
    transition={{ duration: 2, repeat: Infinity }}
  >
    {/* Icon */}
    <div className="text-center mb-6">
      <div className="inline-flex p-6 bg-rose-500/20 rounded-full">
        <AlertTriangle className="w-16 h-16 text-rose-400" />
      </div>
    </div>

    {/* Title */}
    <h1 className="text-5xl font-bold text-center text-rose-400 mb-8">
      DROWNING DETECTED
    </h1>

    {/* Details */}
    <div className="space-y-3 mb-8 text-center">
      <p className="text-2xl text-slate-50">
        Zone: <span className="font-semibold">{zoneName}</span>
      </p>
      <p className="text-xl text-slate-300">
        Time: <span className="font-mono">{timestamp}</span>
      </p>
      <p className="text-xl text-slate-300">
        Confidence: <span className="font-semibold text-rose-400">{confidence}%</span>
      </p>
    </div>

    {/* Actions */}
    <div className="flex flex-col gap-3">
      <button 
        className="btn-danger-lg"
        onClick={handleAcknowledge}
        autoFocus
      >
        ✓ ACKNOWLEDGE
        <kbd className="ml-2 px-2 py-1 bg-white/10 rounded text-sm">A</kbd>
      </button>
      <button className="btn-secondary-lg">
        View Live Footage
      </button>
    </div>
  </motion.div>
</motion.div>
```

### 5.4 Button System

**Button Variants:**

```jsx
// Primary (Cyan - Main actions)
<button className="
  px-4 py-2 rounded-lg
  bg-cyan-500 hover:bg-cyan-400
  text-white font-medium
  transition-colors duration-200
  focus:ring-2 focus:ring-cyan-500/50
">
  Save Changes
</button>

// Danger (Rose - Destructive/Critical)
<button className="
  px-6 py-3 rounded-xl
  bg-rose-500 hover:bg-rose-400
  text-white font-semibold text-lg
  transition-all duration-200
  focus:ring-2 focus:ring-rose-500/50
  shadow-lg shadow-rose-500/20
">
  ACKNOWLEDGE ALERT
</button>

// Secondary (White outline - Alternative actions)
<button className="
  px-4 py-2 rounded-lg
  border border-white/20 hover:border-white/40
  text-slate-50 font-medium
  transition-all duration-200
  hover:bg-white/5
">
  Cancel
</button>

// Ghost (Minimal - Tertiary actions)
<button className="
  px-3 py-1.5 rounded-lg
  text-slate-400 hover:text-slate-50
  hover:bg-white/5
  transition-all duration-200
">
  View Details →
</button>
```

### 5.5 Badge System

**Status Badges:**
```jsx
// Live/Online (Emerald)
<span className="
  inline-flex items-center gap-1.5
  px-2 py-1 rounded-lg
  bg-emerald-500/10 border border-emerald-500/20
  text-emerald-400 text-xs font-medium
">
  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
  LIVE
</span>

// Warning/Degraded (Amber)
<span className="
  inline-flex items-center gap-1.5
  px-2 py-1 rounded-lg
  bg-amber-500/10 border border-amber-500/20
  text-amber-400 text-xs font-medium
">
  <AlertCircle className="w-3 h-3" />
  DEGRADED
</span>

// Error/Alert (Rose)
<span className="
  inline-flex items-center gap-1.5
  px-2.5 py-1.5 rounded-lg
  bg-rose-500/10 border border-rose-500/20
  text-rose-400 text-sm font-semibold
  animate-pulse
">
  <AlertTriangle className="w-4 h-4" />
  ALERT
</span>

// Offline (Slate)
<span className="
  inline-flex items-center gap-1.5
  px-2 py-1 rounded-lg
  bg-slate-500/10 border border-slate-500/20
  text-slate-400 text-xs font-medium
">
  <Circle className="w-3 h-3" />
  OFFLINE
</span>
```

---

## 6. Animation Guidelines

### 6.1 Framer Motion Patterns

**Page Transitions:**
```jsx
// App.js - Wrap routes
<AnimatePresence mode="wait">
  <Routes location={location} key={location.pathname}>
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>
</AnimatePresence>

// Individual pages
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  {/* Page content */}
</motion.div>
```

**Card Entrance (Stagger):**
```jsx
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

<motion.div variants={container} initial="hidden" animate="show">
  {cameras.map(camera => (
    <motion.div key={camera.id} variants={item}>
      <CameraCard {...camera} />
    </motion.div>
  ))}
</motion.div>
```

**Hover Interactions:**
```jsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
>
  Click me
</motion.button>

<motion.div
  whileHover={{ y: -4 }}
  transition={{ type: 'spring', stiffness: 300 }}
>
  <CameraCard />
</motion.div>
```

**Alert Animation:**
```jsx
<motion.div
  initial={{ scale: 0.8, opacity: 0 }}
  animate={{ 
    scale: 1, 
    opacity: 1,
    rotate: [0, -2, 2, -2, 0]  // Shake effect
  }}
  transition={{
    scale: { type: 'spring', damping: 15 },
    rotate: { duration: 0.5 }
  }}
>
  <AlertPanel />
</motion.div>
```

### 6.2 Standard Animation Presets

```javascript
// animations.js
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 }
};

export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.3, ease: 'easeOut' }
};

export const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: 'spring', damping: 20 }
};

export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};
```

### 6.3 Performance Optimization

```jsx
// Use layout animations for position changes
<motion.div layout layoutId="camera-1">
  <CameraCard />
</motion.div>

// Reduce motion for accessibility
const shouldReduceMotion = useReducedMotion();

<motion.div
  animate={shouldReduceMotion ? {} : { y: -4 }}
>
  Content
</motion.div>

// Optimize with will-change
<motion.div
  style={{ willChange: 'transform' }}
  whileHover={{ scale: 1.02 }}
>
  Optimized card
</motion.div>
```

---

## 7. Page Layouts

### 7.1 Login Page

**Layout:**
- Full viewport height
- Centered glassmorphism card (max-w-md)
- Subtle animated background gradient
- Logo at top of card
- Clean form with floating labels
- Single primary CTA

**Structure:**
```jsx
<div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
  <motion.div
    className="glass-prominent w-full max-w-md p-8 rounded-2xl"
    {...scaleIn}
  >
    {/* Logo */}
    <div className="text-center mb-8">
      <HexagonIcon className="w-12 h-12 text-cyan-500 mx-auto mb-3" />
      <h1 className="text-2xl font-bold text-slate-50">AquaGuard</h1>
      <p className="text-slate-400 text-sm">Drowning Detection System</p>
    </div>

    {/* Form */}
    <form className="space-y-4">
      <Input label="Username" />
      <Input label="Password" type="password" />
      <Button variant="primary" fullWidth>
        Sign In
      </Button>
    </form>
  </motion.div>
</div>
```

### 7.2 Dashboard Page

**Layout:**
- Header with page title + quick stats
- Grid of camera cards (responsive: 1/2/3 columns)
- Detection feed sidebar (sticky)
- System status footer

**Structure:**
```jsx
<div className="min-h-screen bg-slate-900 flex">
  <Sidebar />
  
  <main className="flex-1 p-6 overflow-auto">
    {/* Header */}
    <div className="mb-6 flex justify-between items-center">
      <h1 className="text-3xl font-bold text-slate-50">Dashboard</h1>
      <QuickStats cameras={cameras} />
    </div>

    {/* Main grid */}
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {cameras.map(camera => (
        <CameraCard key={camera.id} {...camera} />
      ))}
    </div>

    {/* Recent detections */}
    <div className="mt-8">
      <h2 className="text-xl font-semibold text-slate-50 mb-4">Recent Activity</h2>
      <DetectionFeed limit={5} />
    </div>
  </main>
</div>
```

### 7.3 Incidents Page

**Layout:**
- Tabs: Active Alerts / History / Resolved
- Filter bar (date range, zone, severity)
- Table/cards toggle
- Expandable rows with details

### 7.4 Analytics Page

**Layout:**
- Date range picker
- KPI cards (4 metrics)
- Charts: Detection timeline, zone heatmap, hourly patterns
- Export button

### 7.5 System Page

**Layout:**
- Camera grid with health indicators
- System health gauges
- Connection status
- Logs panel

---

## 8. Responsive Strategy

### Breakpoints
- Mobile: < 640px (1 column, drawer nav)
- Tablet: 640-1024px (2 columns, side drawer)
- Desktop: 1024px+ (3 columns, full sidebar)

### Mobile-First Changes
- Hamburger menu replaces sidebar
- Cards stack vertically
- Reduced padding (px-4 instead of px-6)
- Larger touch targets (min 44px)
- Simplified charts (fewer data points)

---

## 9. Accessibility Checklist

- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible (cyan ring)
- [ ] Color contrast ≥ 4.5:1 for text
- [ ] ARIA labels for icon-only buttons
- [ ] Live regions for alerts (`role="alert"`)
- [ ] Reduced motion support
- [ ] Semantic HTML (`<nav>`, `<main>`, `<article>`)
- [ ] Skip to main content link

---

## 10. Implementation Checklist

### Phase 1: Foundation ✅
- [x] Update Tailwind config
- [x] Add CSS variables
- [x] Install Framer Motion (in package.json, needs `npm install`)
- [x] Add Inter/JetBrains Mono fonts

### Phase 2: Core Components
- [ ] Button system (4 variants)
- [ ] Badge system (4 status types)
- [ ] Card component (3 glass levels)
- [ ] Input components

### Phase 3: Layout
- [ ] Sidebar redesign (minimalist)
- [ ] TopBar redesign
- [ ] Page transitions (AnimatePresence)

### Phase 4: Components
- [ ] Camera Card (glass + status)
- [ ] Alert Panel (full screen variant)
- [ ] Detection Feed
- [ ] Analytics Charts
- [ ] System Status

### Phase 5: Pages
- [ ] Login page
- [ ] Dashboard page
- [ ] Incidents page
- [ ] Analytics page
- [ ] System page

### Phase 6: Polish
- [ ] Micro-interactions
- [ ] Loading states
- [ ] Error states
- [ ] Accessibility audit
- [ ] Performance optimization

---

**End of Agent Instructions**

**Structure:**
```
┌─────────────────────┐
│  🌊 AquaGuard       │  ← Logo with pulse animation
├─────────────────────┤
│  ◉ Dashboard        │  ← Active: aqua glow + left border
│  ○ Incidents        │  ← Inactive: wave-gray text
│  ○ Analytics        │
│  ○ System           │
├─────────────────────┤
│  v1.0.0             │  ← Footer
└─────────────────────┘
```

**Styling:**
- Background: `bg-gradient-to-b from-ocean-deep to-ocean-mid`
- Width: 256px (w-64)
- Active item: `bg-aqua/10 border-l-4 border-aqua text-aqua`
- Hover: `bg-white/5 text-pearl`
- Icons: Heroicons outline, 20x20

### 5.2 Camera Card

**Structure:**
```
┌──────────────────────────────┐
│  [LIVE STREAM VIDEO/IMAGE]   │  ← aspect-video
│  ┌────────┐                  │
│  │● Live  │        [WebRTC]  │  ← Status badges
│  └────────┘                  │
│──────────────────────────────│
│  Zone Name                   │  ← pearl text
│  Location description        │  ← wave-gray text
│  FPS: 29.8 | Health: Normal  │  ← Stats row
└──────────────────────────────┘
```

**Styling:**
- Container: `glass-card` effect
- Alert state: `ring-4 ring-coral animate-pulse`
- Status badge: `bg-seafoam/20 text-seafoam` (live) or `bg-coral/20 text-coral` (offline)
- Hover: `transform hover:scale-[1.02] hover:shadow-aqua/20`

### 5.3 Alert Panel (Critical)

**Full-screen overlay when drowning detected:**

```
┌─────────────────────────────────────────────┐
│  ⚠️ DROWNING DETECTED                       │
│                                             │
│  Zone: Main Pool                            │
│  Confidence: 94%                            │
│  Time: 17:45:32                             │
│                                             │
│  [SNAPSHOT IMAGE]                           │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │      ACKNOWLEDGE ALERT (A)          │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**Styling:**
- Background: `bg-coral/95` with animated pulse
- Text: White, bold, uppercase
- Animation: Shake on mount, continuous edge glow
- Button: White bg, coral text, large (py-4 px-8)
- Must be unmissable — this is life-safety critical

### 5.4 Button Component

**Variants:**

| Variant | Background | Text | Border | Hover |
|---------|------------|------|--------|-------|
| Primary | `gradient-aqua` | `ocean-deep` | none | glow + scale |
| Secondary | `transparent` | `aqua` | `aqua` | `bg-aqua/10` |
| Danger | `gradient-alert` | `white` | none | glow + scale |
| Ghost | `transparent` | `pearl` | none | `bg-white/5` |

**Animations:**
- Click: Ripple effect (Framer Motion)
- Hover: Subtle glow shadow
- Loading: Spinner + disabled state

### 5.5 Badge Component

**Status badges:**

| Status | Background | Text | Extra |
|--------|------------|------|-------|
| Online | `seafoam/20` | `seafoam` | Pulse dot |
| Offline | `coral/20` | `coral` | — |
| Warning | `sunset/20` | `sunset` | — |
| Info | `aqua/20` | `aqua` | — |

---

## 6. Animation Guidelines

### Using Framer Motion

```javascript
// Page transition
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.3 }}
>
```

### Standard Animations

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| Page enter | Fade + slide up | 300ms | ease-out |
| Card hover | Scale 1.02 | 200ms | ease-out |
| Button click | Ripple | 400ms | ease-out |
| Alert mount | Shake + pulse | 500ms | spring |
| List items | Stagger 50ms | 200ms each | ease-out |
| Modal | Scale + fade | 200ms | ease-out |

### Wave Animation (CSS)
```css
@keyframes wave {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

.animate-wave {
  animation: wave 3s ease-in-out infinite;
}
```

### Pulse Glow (CSS)
```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(0, 217, 255, 0.3); }
  50% { box-shadow: 0 0 40px rgba(0, 217, 255, 0.6); }
}

.animate-glow {
  animation: pulse-glow 2s ease-in-out infinite;
}
```

---

## 7. Page Layouts

### 7.1 Login Page

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│         [Animated Ocean Background]                 │
│                                                     │
│              ┌─────────────────────┐                │
│              │   🌊 AquaGuard      │                │
│              │                     │                │
│              │   Username          │                │
│              │   [____________]    │                │
│              │                     │                │
│              │   Password          │                │
│              │   [____________]    │                │
│              │                     │                │
│              │   ☐ Remember me     │                │
│              │                     │                │
│              │   [  Sign In  ]     │                │
│              └─────────────────────┘                │
│                                                     │
│              © 2026 AquaGuard                       │
└─────────────────────────────────────────────────────┘
```

**Background Animation:**
- CSS gradient waves moving slowly
- Or: SVG wave pattern with subtle movement

### 7.2 Dashboard Page

```
┌────────┬────────────────────────────────────────────┐
│        │  TopBar: AquaGuard | Search | User Menu   │
│        ├────────────────────────────────────────────┤
│ Side   │                                            │
│ bar    │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│        │  │ Camera 1 │ │ Camera 2 │ │ Camera 3 │   │
│        │  └──────────┘ └──────────┘ └──────────┘   │
│        │                                            │
│        │  ┌──────────────────────┐ ┌────────────┐  │
│        │  │   Detection Feed     │ │  System    │  │
│        │  │   - Event 1          │ │  Health    │  │
│        │  │   - Event 2          │ │            │  │
│        │  │   - Event 3          │ │  ● Online  │  │
│        │  └──────────────────────┘ └────────────┘  │
└────────┴────────────────────────────────────────────┘
```

### 7.3 Analytics Page

```
┌────────┬────────────────────────────────────────────┐
│        │  Analytics                                 │
│        ├────────────────────────────────────────────┤
│ Side   │  ┌─────────────────────────────────────┐   │
│ bar    │  │ Time Range: [7 days ▼] Group: [Zone]│   │
│        │  └─────────────────────────────────────┘   │
│        │                                            │
│        │  ┌─────────────────────────────────────┐   │
│        │  │     Alert Counts by Zone            │   │
│        │  │     [████ ██ ███████ ████]          │   │
│        │  └─────────────────────────────────────┘   │
│        │                                            │
│        │  ┌─────────────────────────────────────┐   │
│        │  │     Detections Over Time            │   │
│        │  │     ___/\___/\____/\___             │   │
│        │  └─────────────────────────────────────┘   │
└────────┴────────────────────────────────────────────┘
```

---

## 8. Implementation Checklist

### Phase 1: Foundation
- [ ] Install Framer Motion: `npm install framer-motion`
- [ ] Update `tailwind.config.js` with ocean palette
- [ ] Update `index.css` with CSS variables and keyframes
- [ ] Add Google Fonts (Inter, JetBrains Mono) to `public/index.html`

### Phase 2: Core Components
- [ ] Create `components/ui/Button.jsx` — animated button
- [ ] Create `components/ui/Card.jsx` — glassmorphism card
- [ ] Create `components/ui/Badge.jsx` — status badge
- [ ] Redesign `components/layout/Sidebar.js`
- [ ] Redesign `components/layout/TopBar.js`

### Phase 3: Pages
- [ ] Redesign `pages/LoginPage.js` — ocean background
- [ ] Redesign `pages/DashboardPage.js` — new layout
- [ ] Redesign `components/camera/CameraCard.js` — glass effect
- [ ] Redesign `components/alerts/AlertPanel.js` — dramatic overlay

### Phase 4: Data Components
- [ ] Redesign `components/analytics/AnalyticsChart.js`
- [ ] Redesign `components/alerts/AlertHistory.js`
- [ ] Redesign `components/system/SystemStatus.js`

### Phase 5: Polish
- [ ] Add loading skeleton screens
- [ ] Add page transition animations
- [ ] Add micro-interactions (hover, click)
- [ ] Mobile responsive review

---

## 9. Tailwind Config Reference

```javascript
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ocean: {
          deep: '#0a192f',
          mid: '#0d3b66',
          light: '#112240',
        },
        aqua: '#00d9ff',
        seafoam: '#64ffda',
        coral: '#ff6b6b',
        sunset: '#ffa726',
        pearl: '#e6f1ff',
        wave: '#8892b0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'wave': 'wave 3s ease-in-out infinite',
        'glow': 'pulse-glow 2s ease-in-out infinite',
        'ripple': 'ripple 0.4s ease-out',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 217, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 217, 255, 0.6)' },
        },
        ripple: {
          '0%': { transform: 'scale(0)', opacity: '0.5' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
```

---

## 10. File Structure

```
frontend/src/
├── components/
│   ├── ui/                    # NEW: Reusable UI components
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Badge.jsx
│   │   ├── Input.jsx
│   │   └── LiquidGauge.jsx
│   ├── layout/
│   │   ├── Sidebar.js         # REDESIGN
│   │   └── TopBar.js          # REDESIGN
│   ├── camera/
│   │   ├── CameraCard.js      # REDESIGN
│   │   ├── CameraGrid.js
│   │   └── CameraManagementPanel.js
│   ├── alerts/
│   │   ├── AlertPanel.js      # REDESIGN
│   │   ├── AlertHistory.js    # REDESIGN
│   │   └── AlertBadge.js
│   ├── analytics/
│   │   └── AnalyticsChart.js  # REDESIGN
│   └── system/
│       └── SystemStatus.js    # REDESIGN
├── pages/
│   ├── LoginPage.js           # REDESIGN
│   ├── DashboardPage.js       # REDESIGN
│   ├── IncidentsPage.js       # REDESIGN
│   ├── AnalyticsPage.js
│   └── SystemPage.js
├── hooks/
├── context/
├── utils/
├── index.css                  # UPDATE: Add CSS variables
├── App.js                     # UPDATE: Add AnimatePresence
└── App.css
```

---

## 11. Design Principles

1. **Life-safety first** — Alerts must be unmissable and dramatic
2. **Performance** — Animations must not lag (use `will-change`, GPU layers)
3. **Accessibility** — Maintain 4.5:1 contrast ratio, keyboard navigation
4. **Consistency** — Use design tokens everywhere, no magic values
5. **Delight** — Micro-interactions that feel satisfying but not distracting

---

## 12. Do's and Don'ts

### ✅ Do
- Use the defined color palette (no random blues)
- Apply glassmorphism to all cards
- Add hover states to all interactive elements
- Use Framer Motion for complex animations
- Keep alert styling dramatic and unmissable
- Test on dark backgrounds

### ❌ Don't
- Use pure white backgrounds
- Skip loading/error states
- Make animations longer than 300ms for UI feedback
- Reduce alert visibility for aesthetics
- Use inline styles (use Tailwind classes)
- Forget mobile responsiveness

---

## 13. Quick Reference

### Common Tailwind Classes

```html
<!-- Glass card -->
<div class="bg-ocean-mid/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-6">

<!-- Primary button -->
<button class="bg-gradient-to-r from-aqua to-seafoam text-ocean-deep font-semibold px-6 py-3 rounded-xl hover:shadow-lg hover:shadow-aqua/25 transition-all">

<!-- Status badge (online) -->
<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-seafoam/20 text-seafoam text-xs font-medium">
  <span class="w-1.5 h-1.5 rounded-full bg-seafoam animate-pulse"></span>
  Online
</span>

<!-- Section heading -->
<h2 class="text-2xl font-bold text-pearl">Dashboard</h2>
<p class="text-sm text-wave mt-1">Real-time pool monitoring</p>
```

---

*This document is the source of truth for all frontend redesign work.*
