# RightPath UI — Next-Generation Design System

> **Vision:** A premium, enterprise-grade design language that feels like Linear meets Vercel — minimal, fast, and intelligent. Dark-mode first. Built to last the next decade.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Layout Grid](#4-spacing--layout-grid)
5. [Depth & Elevation](#5-depth--elevation)
6. [Motion & Micro-Interactions](#6-motion--micro-interactions)
7. [Component Design Concepts](#7-component-design-concepts)
8. [UX Patterns for Enterprise Workflows](#8-ux-patterns-for-enterprise-workflows)
9. [Accessibility & Responsive Design](#9-accessibility--responsive-design)
10. [React Architecture Alignment](#10-react-architecture-alignment)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. Design Philosophy

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Dark-First** | Design for dark mode as the primary canvas. Light mode is a carefully crafted parity, not an afterthought. |
| **Content Density** | Show more data with less noise. Every pixel earns its place. |
| **Quiet Confidence** | No flashy gradients or heavy shadows. Subtle depth, muted tones, precise spacing. |
| **Motion with Purpose** | Every animation communicates state change. No decoration-only motion. |
| **Progressive Disclosure** | Show the essential first. Reveal complexity on demand. |
| **Zero Cognitive Load** | The interface should feel obvious. If you need a tutorial, the design failed. |

### Visual DNA

```
Apple-level craft on typography and spacing
Linear's keyboard-first, command-palette UX
Stripe's documentation-grade clarity
Vercel's dark canvas with luminous accents
Figma's collaborative, real-time feel
```

---

## 2. Color System

### Philosophy

Colors follow a **semantic layering** model. Instead of "blue button," think "primary action." Instead of "gray background," think "surface-elevated."

### Dark Theme (Primary)

#### Backgrounds & Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-canvas` | `#09090b` | Deepest background (page canvas) |
| `--bg-default` | `#0a0a0c` | Default page background |
| `--bg-subtle` | `#111114` | Slightly elevated areas |
| `--bg-muted` | `#18181b` | Cards, panels, containers |
| `--bg-elevated` | `#1f1f23` | Modals, popovers, floating elements |
| `--bg-overlay` | `#27272a` | Hover states on surfaces |
| `--bg-wash` | `#2e2e33` | Dividers, empty states, wells |

#### Text Hierarchy

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#fafafa` | Headlines, primary content |
| `--text-secondary` | `#a1a1aa` | Body text, descriptions |
| `--text-tertiary` | `#71717a` | Captions, timestamps, hints |
| `--text-quaternary` | `#52525b` | Disabled text, placeholders |
| `--text-inverse` | `#09090b` | Text on colored backgrounds |

#### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `--border-default` | `#27272a` | Card borders, dividers |
| `--border-muted` | `#1f1f23` | Subtle separators |
| `--border-strong` | `#3f3f46` | Input borders, emphasized edges |
| `--border-focus` | `#6366f1` | Focus rings |

#### Accent Colors (Semantic)

| Token | Hex | Light Variant | Usage |
|-------|-----|---------------|-------|
| `--accent-primary` | `#6366f1` | `#818cf8` | Primary actions, active states |
| `--accent-secondary` | `#8b5cf6` | `#a78bfa` | Secondary CTAs, highlights |
| `--accent-success` | `#10b981` | `#34d399` | Success states, confirmations |
| `--accent-warning` | `#f59e0b` | `#fbbf24` | Warnings, caution states |
| `--accent-error` | `#ef4444` | `#f87171` | Errors, destructive actions |
| `--accent-info` | `#06b6d4` | `#22d3ee` | Informational states |

#### Accent Backgrounds (Muted)

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-primary-muted` | `rgba(99, 102, 241, 0.12)` | Primary badge bg, selected row |
| `--accent-success-muted` | `rgba(16, 185, 129, 0.12)` | Success badge bg |
| `--accent-warning-muted` | `rgba(245, 158, 11, 0.12)` | Warning badge bg |
| `--accent-error-muted` | `rgba(239, 68, 68, 0.12)` | Error badge bg |
| `--accent-info-muted` | `rgba(6, 182, 212, 0.12)` | Info badge bg |

#### Special Purpose

| Token | Value | Usage |
|-------|-------|-------|
| `--gradient-brand` | `linear-gradient(135deg, #6366f1, #8b5cf6)` | Logo, brand moments |
| `--gradient-premium` | `linear-gradient(135deg, #6366f1, #a855f7, #ec4899)` | Premium features |
| `--glow-primary` | `0 0 20px rgba(99, 102, 241, 0.3)` | Focus glow effects |

### Light Theme (Parity)

#### Backgrounds & Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-canvas` | `#f8f9fb` | Page canvas |
| `--bg-default` | `#ffffff` | Default background |
| `--bg-subtle` | `#f4f4f5` | Subtle elevation |
| `--bg-muted` | `#ffffff` | Cards (pure white) |
| `--bg-elevated` | `#ffffff` | Modals |
| `--bg-overlay` | `#f4f4f5` | Hover states |
| `--bg-wash` | `#e4e4e7` | Wells, dividers |

#### Text (Light)

| Token | Hex |
|-------|-----|
| `--text-primary` | `#09090b` |
| `--text-secondary` | `#52525b` |
| `--text-tertiary` | `#71717a` |
| `--text-quaternary` | `#a1a1aa` |

#### Borders (Light)

| Token | Hex |
|-------|-----|
| `--border-default` | `#e4e4e7` |
| `--border-muted` | `#f4f4f5` |
| `--border-strong` | `#d4d4d8` |

### Pipeline Stage Colors

| Stage | Dark Hex | Light Hex | Token |
|-------|----------|-----------|-------|
| Applied | `#818cf8` | `#6366f1` | `--stage-applied` |
| Screening | `#a78bfa` | `#8b5cf6` | `--stage-screening` |
| Interview | `#60a5fa` | `#3b82f6` | `--stage-interview` |
| Assessment | `#22d3ee` | `#06b6d4` | `--stage-assessment` |
| Offer | `#34d399` | `#10b981` | `--stage-offer` |
| Hired | `#10b981` | `#059669` | `--stage-hired` |
| Rejected | `#f87171` | `#ef4444` | `--stage-rejected` |

### Data Visualization Palette

```
Series 1: #6366f1 (Indigo)
Series 2: #8b5cf6 (Violet)
Series 3: #06b6d4 (Cyan)
Series 4: #10b981 (Emerald)
Series 5: #f59e0b (Amber)
Series 6: #ec4899 (Pink)
Series 7: #f97316 (Orange)
Series 8: #14b8a6 (Teal)
```

---

## 3. Typography

### Font Stack

```css
/* Headings */
font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;

/* Body */
font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;

/* Monospace (code, Monaco editor labels, data IDs) */
font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
```

### Type Scale (1.200 Minor Third)

| Name | Size | Line Height | Weight | Letter Spacing | Usage |
|------|------|-------------|--------|----------------|-------|
| `display-xl` | 48px | 1.1 | 800 | -0.04em | Hero sections |
| `display` | 36px | 1.15 | 700 | -0.03em | Page titles |
| `heading-1` | 28px | 1.2 | 700 | -0.025em | Section headers |
| `heading-2` | 24px | 1.25 | 600 | -0.02em | Card titles |
| `heading-3` | 20px | 1.3 | 600 | -0.015em | Sub-sections |
| `heading-4` | 16px | 1.4 | 600 | -0.01em | Small headers |
| `body-lg` | 16px | 1.6 | 400 | -0.006em | Important body text |
| `body` | 14px | 1.6 | 400 | -0.006em | Default body text |
| `body-sm` | 13px | 1.55 | 400 | 0 | Secondary content |
| `caption` | 12px | 1.5 | 500 | 0.02em | Labels, timestamps |
| `overline` | 11px | 1.4 | 600 | 0.08em | Section overlines (uppercase) |
| `mono` | 13px | 1.6 | 400 | -0.02em | Code, data IDs |

### Typography Rules

1. **Negative letter-spacing** on headings (tighter tracking for large text)
2. **Positive letter-spacing** on overlines (all-caps needs breathing room)
3. **Font feature settings:** `'cv02', 'cv03', 'cv04', 'cv11'` for Inter alternate glyphs
4. **Anti-aliasing:** Always `-webkit-font-smoothing: antialiased`
5. **Tabular numbers** for data tables: `font-variant-numeric: tabular-nums`
6. **No underlined links** in body text — use color + hover effects instead

---

## 4. Spacing & Layout Grid

### Spacing Scale (4px base)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0.5` | 2px | Micro gaps |
| `--space-1` | 4px | Tight padding (badges) |
| `--space-1.5` | 6px | Compact gaps |
| `--space-2` | 8px | Default inline spacing |
| `--space-3` | 12px | Component internal padding |
| `--space-4` | 16px | Card padding, form gaps |
| `--space-5` | 20px | Section padding |
| `--space-6` | 24px | Major section spacing |
| `--space-8` | 32px | Page section gaps |
| `--space-10` | 40px | Large section gaps |
| `--space-12` | 48px | Page-level spacing |
| `--space-16` | 64px | Major layout gaps |
| `--space-20` | 80px | Hero spacing |

### Layout Grid

```
Sidebar (240px / 72px collapsed)
  │
  ├── Content Area (max-width: 1440px)
  │     │
  │     ├── Padding: 24px desktop, 16px tablet, 12px mobile
  │     ├── Grid: 12-column CSS Grid
  │     ├── Gap: 24px desktop, 16px mobile
  │     │
  │     └── Card padding: 20px default, 24px spacious, 16px compact
  │
  └── Navbar: height 56px, sticky top
```

### Responsive Breakpoints

| Name | Width | Behavior |
|------|-------|----------|
| `xs` | < 640px | Single column, sidebar hidden |
| `sm` | 640px+ | Single column, sidebar overlay |
| `md` | 768px+ | Sidebar collapsed, 2-column grids |
| `lg` | 1024px+ | Sidebar expanded, full grid |
| `xl` | 1280px+ | Wide content, dashboards flourish |
| `2xl` | 1536px+ | Max width capped, centered |

---

## 5. Depth & Elevation

### Shadow System

In dark mode, shadows are nearly invisible. Use **border luminance** and **background shifts** instead.

| Level | Name | Light Mode | Dark Mode Approach |
|-------|------|-----------|-------------------|
| 0 | `flat` | None | None |
| 1 | `subtle` | `0 1px 2px rgba(0,0,0,0.04)` | Border only |
| 2 | `card` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | `bg-muted` + border |
| 3 | `elevated` | `0 4px 12px rgba(0,0,0,0.08)` | Lighter `bg-elevated` |
| 4 | `floating` | `0 8px 24px rgba(0,0,0,0.12)` | Lighter bg + border glow |
| 5 | `modal` | `0 16px 48px rgba(0,0,0,0.16)` | Backdrop blur + lighter bg |

### Glassmorphism (Use Sparingly)

Reserve for: command palette, navbar on scroll, floating action bars, modal backdrops.

```css
.glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
```

### Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Badges, pills |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 12px | Cards, panels |
| `--radius-xl` | 16px | Modals, large containers |
| `--radius-2xl` | 20px | Feature cards, hero sections |
| `--radius-full` | 9999px | Avatars, circular elements |

---

## 6. Motion & Micro-Interactions

### Motion Principles

1. **Motion = Feedback** — every animation tells the user something happened
2. **Fast by default** — most transitions 150-200ms
3. **Ease-out for entries**, ease-in for exits
4. **Stagger for groups** — lists animate children with 30-50ms delays
5. **Respect `prefers-reduced-motion`** — all motion must be disableable

### Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--duration-instant` | 100ms | Hover states, toggles |
| `--duration-fast` | 150ms | Button press, icon changes |
| `--duration-normal` | 200ms | Card transitions, dropdowns |
| `--duration-moderate` | 300ms | Page transitions, sidebars |
| `--duration-slow` | 400ms | Complex entrance animations |

### Easing Curves

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-default` | `cubic-bezier(0.2, 0, 0, 1)` | General transitions |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exit animations |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entrance animations |
| `--ease-spring` | `cubic-bezier(0.22, 1, 0.36, 1)` | Natural, spring-like |
| `--ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful micro-interactions |

### Key Micro-Interactions

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Button press | `scale(0.97)` + slight opacity | 100ms |
| Card hover | `translateY(-2px)` + shadow increase | 200ms |
| Sidebar toggle | Width transition + content fade | 300ms |
| Modal open | Backdrop fade + content `scale(0.95 to 1)` | 200ms |
| Toast enter | Slide from right + fade in | 300ms |
| Page transition | Fade in + `translateY(8 to 0)` | 300ms |
| Table row hover | Background color shift | 100ms |
| Dropdown open | `scaleY(0.95 to 1)` + fade | 150ms |
| Tab indicator | Slide to new position | 200ms |
| Focus ring | Ring appears with subtle expand | 150ms |

---

## 7. Component Design Concepts

### 7.1 Sidebar Navigation

**Target:** Premium, context-aware, keyboard-navigable.

```
Logo area (56px height) — gradient icon + gradient text
  |
Section: MAIN (overline label, 11px uppercase)
  |- Active item: filled dot, accent bg-muted, left-2px accent border
  |- Inactive: text-secondary, hover: bg-overlay + slight translateX
  |
Section: ASSESSMENTS (divider overline)
  |- Items with optional notification badges
  |
Section: INTERVIEWS
  |
Bottom pinned:
  |- Settings, Profile
  |- Logout (danger hover)
  |
User card: avatar + name + role badge
```

**Key upgrades:**
- Section grouping with overline labels
- User card at the bottom with role badge
- Keyboard navigation (Arrow keys + Enter)
- Collapsed state: icons only with tooltips
- Active indicator: left accent border + muted accent background

### 7.2 Navbar

```
Left:  Breadcrumb trail (clickable segments)
Right: Command palette trigger (Cmd+K) | Theme toggle | Notifications bell | User avatar
```

**New: Command Palette (Cmd+K)**

Linear/Vercel-style command palette for instant navigation, search, and quick actions:

```
Search input: "Type a command or search..."
  |
  |- RECENT: Recently visited pages, candidates
  |- NAVIGATION: Dashboard, Candidates, Create Job (with shortcuts)
  |- ACTIONS: Toggle Theme, Schedule Interview
```

### 7.3 Dashboard Stats Cards

**Target:** Rich contextual cards with trends and sparklines.

```
Card structure:
  |- Title (caption size, text-secondary)
  |- Value (48px+ heading, font-bold)
  |- Trend indicator (arrow + percentage, green/red)
  |- Sparkline or progress bar (tiny visual context)
  |- Subtle 2px colored left border to categorize
  |- Hover: translateY(-2px) + shadow increase
```

**Rule:** The number IS the visual. No icons competing with it.

### 7.4 Pipeline Kanban Board

For admin candidate pipeline — Kanban columns:

```
Applied(42) | Screening(28) | Interview(15) | Offer(8) | Hired(3)
  |              |                |              |           |
  Candidate      Candidate        Candidate      Candidate   Candidate
  cards with     cards with       cards          cards       cards
  avatar, role,  match %
  ATS score
```

### 7.5 Data Tables

**Target:** Dense, scannable, interactive tables.

Design rules:
- **Row height: 48px** — comfortable without waste
- **Alternating rows** — subtle `bg-subtle` on every-other-row
- **Hover state** — full row highlights with `bg-overlay`
- **Sticky header** — stays visible while scrolling
- **Inline status** — colored dot + text (not large badges)
- **Checkbox selection** for bulk actions
- **Truncation with tooltip** on long values
- **Tabular numbers** on all numeric columns
- **Empty state** — illustration + message + CTA

### 7.6 Forms

Design rules:
- **Labels above inputs** (not floating)
- **Input height: 44px** (touch-friendly)
- **Focus: 2px ring** with accent-primary at 30% opacity
- **Error state:** red border + red text below + subtle red bg tint
- **Character counter** for textareas (right-aligned)
- **Section dividers** with overline labels for long forms
- **Button group:** Tertiary (cancel) | Secondary (save) | Primary (submit)
- **Two-column on desktop**, single on mobile
- **Hint text** below complex inputs

### 7.7 Modals

Design rules:
- **Backdrop:** `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- **Max width:** 480px confirmations, 640px forms, 800px data
- **Entry:** `scale(0.95 to 1)` + `opacity(0 to 1)` in 200ms
- **Close:** X button + Escape key + backdrop click
- **Destructive:** red primary button with warning icon

### 7.8 Toasts

Design rules:
- **Position:** top-right, 16px from edges
- **Width:** 360px max
- **Left border accent** (3px, semantic color)
- **Auto-dismiss:** 5s for success, persistent for errors
- **Stack:** max 3 visible, new pushes old down
- **Optional action button** ("Undo", "Resolve")

---

## 8. UX Patterns for Enterprise Workflows

### 8.1 List-Detail Pattern

For candidate/job workflows:

**Level 1 (List):** Scannable rows with key metrics, click to expand.
**Level 2 (Detail):** Rich header with actions + tabbed content (Overview, Resume, Assessments, Timeline).
**Alternative:** Right slide-over panel instead of full navigation (faster triage).

### 8.2 Multi-Step Workflows

For complex flows (Create Assessment, Assign, Review):

- Horizontal stepper on desktop, vertical on mobile
- Completed steps: checkmark, clickable to revisit
- Current step: accent color, bold label
- Future steps: hollow circle, muted
- Final step: read-only review summary
- Progress persists when navigating back

### 8.3 Bulk Actions

Floating action bar pattern:
- Appears from bottom when items selected
- Shows selection count + contextual actions
- Dismiss deselects all
- Stays visible while scrolling

### 8.4 Filter & Search

- Quick filter pills for most common dimension (status)
- Advanced filters in collapsible panel
- Active filter chips (individually removable)
- "Clear All" button
- Real-time result count
- URL-persisted filters (shareable/bookmarkable)
- 300ms debounced search

### 8.5 Empty States

- Simple monochrome illustration or icon
- Headline: what's missing
- Description: why + what to do
- CTA button: logical next action
- No blame language

### 8.6 Loading States

- Skeleton shapes matching content layout
- Left-to-right shimmer wave
- No full-page spinners (always show page structure)
- Spinner only for inline actions (button loading)
- Progressive loading (show partial data as it arrives)

---

## 9. Accessibility & Responsive Design

### WCAG 2.1 AA Compliance

| Requirement | Implementation |
|-------------|---------------|
| Color contrast | 4.5:1 body text, 3:1 large text |
| Focus indicators | 2px ring, accent-primary, 2px offset |
| Keyboard nav | Tab for all interactive, Arrow keys for lists, Escape to close |
| Screen readers | `aria-label` on icon buttons, `aria-live` for toasts |
| Touch targets | Minimum 44x44px |
| Motion | Respect `prefers-reduced-motion` |
| Color independence | Never color alone for meaning — add icons/text |
| Form errors | `aria-describedby` linking, focus moves to first error |

### Responsive Component Behavior

| Component | Desktop | Tablet | Mobile |
|-----------|---------|--------|--------|
| Sidebar | 240px expanded | 72px icons | Hidden, hamburger |
| Navbar | Full breadcrumb + actions | Short breadcrumb | Logo + hamburger + avatar |
| Stats grid | 4 columns | 2 columns | 1 column |
| Data table | Full columns | Key columns + scroll | Card view |
| Forms | 2-column | 1 column | 1 column full-width |
| Modals | Centered, max-width | Centered margins | Full-screen bottom sheet |

### Touch-Friendly Rules

- Button/input min height: 44px
- 8px+ spacing between interactive elements
- Swipe gestures for sidebar (mobile)
- Bottom sheet modals on mobile

---

## 10. React Architecture Alignment

### Component Pattern: Compound Components + CVA

```tsx
// Compound component pattern
<Card variant="elevated" padding="lg">
  <Card.Header>
    <Card.Title>Pipeline Overview</Card.Title>
    <Card.Description>Track candidate progress</Card.Description>
  </Card.Header>
  <Card.Content>...</Card.Content>
  <Card.Footer>
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">Save</Button>
  </Card.Footer>
</Card>
```

### CVA Variant System

Replace manual variant mapping with `class-variance-authority`:

```tsx
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all rounded-lg focus-visible:ring-2 active:scale-[0.97]',
  {
    variants: {
      variant: {
        primary: 'bg-[var(--accent-primary)] text-white hover:brightness-110',
        secondary: 'bg-[var(--bg-overlay)] text-[var(--text-primary)] hover:bg-[var(--bg-wash)]',
        outline: 'border border-[var(--border-strong)] hover:bg-[var(--bg-overlay)]',
        ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]',
        danger: 'bg-[var(--accent-error)] text-white hover:brightness-110',
      },
      size: {
        sm: 'h-8 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-11 px-5 text-base gap-2',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);
```

### Recommended New Libraries

| Library | Purpose |
|---------|---------|
| `class-variance-authority` | Type-safe component variants |
| `clsx` + `tailwind-merge` | Proper Tailwind class merging |
| `framer-motion` | Declarative animations, gestures, layout |
| `@radix-ui/react-*` | Accessible headless UI primitives |
| `cmdk` | Command palette (Cmd+K) |
| `recharts` or `@nivo/core` | Dashboard charts |
| `sonner` | Premium toast notifications |
| `nuqs` | URL-synced filter/search state |

### Recommended File Structure

```
src/
  design-system/
    tokens/
      colors.ts, typography.ts, spacing.ts, motion.ts, index.ts
    primitives/          (Radix-based headless components)
      Dialog.tsx, Dropdown.tsx, Tooltip.tsx, Popover.tsx
    components/          (Styled, CVA-based components)
      Button.tsx, Card.tsx, Input.tsx, Badge.tsx,
      DataTable.tsx, StatsCard.tsx, CommandPalette.tsx, KanbanBoard.tsx
  lib/
    cn.ts               (clsx + tailwind-merge utility)
```

### cn() Utility

```tsx
// src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### State Management Additions

Keep current Context API approach. Add:
- `SidebarContext` — collapsed state, persisted to localStorage
- `CommandPaletteContext` — open/close, recent items
- URL state via `nuqs` — filter/search persistence in query params

### Performance Techniques

| Technique | Where |
|-----------|-------|
| `React.lazy()` + `Suspense` | Code-split page routes |
| `useMemo` / `useCallback` | Table column defs, filtered data |
| `@tanstack/react-virtual` | Long lists (100+ rows) |
| `IntersectionObserver` | Lazy-load dashboard charts |
| CSS `content-visibility: auto` | Long scrollable pages |
| WebP + lazy loading | Profile photos |

---

## 11. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Install dependencies (cva, clsx, tailwind-merge, framer-motion, radix, cmdk)
- [ ] Update `theme/tokens.ts` with new semantic color system
- [ ] Update `tailwind.config.js` with expanded design tokens
- [ ] Update `index.css` with new global styles and utilities
- [ ] Update `ThemeContext.tsx` to apply new CSS variables
- [ ] Create `cn()` utility function

### Phase 2: Core Components (Week 2-4)
- [ ] Redesign Button with CVA variants
- [ ] Redesign Card as compound component
- [ ] Redesign Input, Select, Textarea
- [ ] Redesign Badge with semantic variants
- [ ] Redesign Modal with Radix Dialog + Framer Motion
- [ ] Redesign DataTable with sticky headers, selection
- [ ] Redesign Toast with Sonner
- [ ] Build CommandPalette with cmdk

### Phase 3: Layout (Week 4-5)
- [ ] Redesign Sidebar with sections, user card, keyboard nav
- [ ] Redesign Navbar with command palette, breadcrumbs
- [ ] Redesign Layout with responsive grid
- [ ] Add page transition animations

### Phase 4: Page Redesigns (Week 5-8)
- [ ] Admin Dashboard (stats, kanban, charts)
- [ ] Candidate Dashboard
- [ ] ATS Screening page
- [ ] Candidates pipeline page
- [ ] Form pages (Job Post, Assessment)
- [ ] Auth pages (Login, Register)

### Phase 5: Polish (Week 8-10)
- [ ] Skeleton loading states for all pages
- [ ] Empty states for all lists
- [ ] Error boundary UI improvement
- [ ] Mobile responsive pass
- [ ] Accessibility audit
- [ ] Performance optimization
- [ ] Dark/Light mode transition polish

---

## CSS Variable Naming Convention

```
--{category}-{variant}

Categories: bg-, text-, border-, accent-, shadow-, radius-, space-, ease-, duration-

Examples:
  --bg-muted          --text-secondary       --border-focus
  --accent-primary    --accent-error-muted   --shadow-card
  --radius-lg         --space-4              --ease-spring
```

### Tailwind Usage Convention

```tsx
className="bg-[var(--bg-muted)]"                    // Background
className="text-[var(--text-primary)]"               // Text
className="border border-[var(--border-default)]"    // Border
className="hover:bg-[var(--bg-overlay)]"             // Hover
className="focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"  // Focus
className="shadow-card"                              // Shadow (via Tailwind extend)
className="rounded-card"                             // Radius (via Tailwind extend)
```

---

*This design system is a living document. Update as patterns evolve.*
