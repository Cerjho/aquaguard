# AquaGuard Frontend Redesign — Agent Instructions

This document contains the complete plan for redesigning the AquaGuard frontend
with an **Ocean/Water Theme**. Any agent working on frontend tasks must follow
this design system.

---

## 1. Vision

Transform AquaGuard from a functional monitoring dashboard into a **visually
stunning ocean-themed experience** that feels immersive, modern, and professional
— while maintaining life-safety usability.

### Design Direction
- Deep ocean blues → aqua gradient transitions
- Subtle wave patterns and fluid animations
- Glowing accents like bioluminescence
- Water ripple effects on interactions
- Frosted glass cards over ocean backgrounds

---

## 2. Color Palette

| Role | Name | Hex | Tailwind Class | Usage |
|------|------|-----|----------------|-------|
| Background | Ocean Deep | `#0a192f` | `bg-ocean-deep` | Main background, sidebar |
| Card BG | Ocean Mid | `#0d3b66` | `bg-ocean-mid` | Cards, panels, modals |
| Primary | Aqua Glow | `#00d9ff` | `text-aqua` | Accents, active states, links |
| Success | Seafoam | `#64ffda` | `text-seafoam` | Online status, success |
| Danger | Coral Alert | `#ff6b6b` | `text-coral` | Alerts, errors, danger |
| Warning | Sunset | `#ffa726` | `text-sunset` | Warning states |
| Text Primary | Pearl White | `#e6f1ff` | `text-pearl` | Headings, primary text |
| Text Secondary | Wave Gray | `#8892b0` | `text-wave` | Secondary text, labels |
| Border | Glass Border | `rgba(255,255,255,0.1)` | `border-glass` | Card borders |

### Gradient Definitions
```css
/* Ocean gradient for backgrounds */
--gradient-ocean: linear-gradient(135deg, #0a192f 0%, #0d3b66 50%, #112240 100%);

/* Aqua glow for buttons/accents */
--gradient-aqua: linear-gradient(135deg, #00d9ff 0%, #64ffda 100%);

/* Alert gradient */
--gradient-alert: linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%);
```

---

## 3. Typography

### Font Stack
```css
/* Primary font - clean, modern */
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

/* Monospace for data/stats */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Font Sizes
| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 2.5rem (40px) | 700 | 1.2 |
| H2 | 2rem (32px) | 600 | 1.3 |
| H3 | 1.5rem (24px) | 600 | 1.4 |
| H4 | 1.25rem (20px) | 500 | 1.4 |
| Body | 1rem (16px) | 400 | 1.6 |
| Small | 0.875rem (14px) | 400 | 1.5 |
| Caption | 0.75rem (12px) | 400 | 1.4 |

---

## 4. Glassmorphism Effect

Standard glass card styling:
```css
.glass-card {
  background: rgba(13, 59, 102, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

Tailwind equivalent:
```html
<div class="bg-ocean-mid/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
```

---

## 5. Component Specifications

### 5.1 Sidebar Navigation

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
