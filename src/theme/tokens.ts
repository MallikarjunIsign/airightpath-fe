// ============================================================================
// RightPath UI — Premium Enterprise Design Tokens
// Sage-mint sidebar · Warm neutral content · Green-teal accents
// Future-ready, calm, confident, and visually rich
// ============================================================================

// ---------------------------------------------------------------------------
// Spacing Scale (4px base unit)
// ---------------------------------------------------------------------------
export const spacing = {
  '0': '0px',
  px: '1px',
  '0.5': '2px',
  '1': '4px',
  '1.5': '6px',
  '2': '8px',
  '2.5': '10px',
  '3': '12px',
  '3.5': '14px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '7': '28px',
  '8': '32px',
  '9': '36px',
  '10': '40px',
  '12': '48px',
  '14': '56px',
  '16': '64px',
  '20': '80px',
  '24': '96px',
};

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------
export const borderRadius = {
  none: '0px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px',
};

// ---------------------------------------------------------------------------
// Shadows (Light mode — dark mode uses bg shifts + borders)
// ---------------------------------------------------------------------------
export const shadows = {
  none: 'none',
  subtle: '0 1px 2px rgba(0, 0, 0, 0.04)',
  card: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  elevated: '0 4px 12px rgba(0, 0, 0, 0.08)',
  floating: '0 8px 24px rgba(0, 0, 0, 0.12)',
  modal: '0 16px 48px rgba(0, 0, 0, 0.16)',
};

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------
export const breakpoints = {
  xs: '480px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// ---------------------------------------------------------------------------
// Motion — Duration & Easing
// ---------------------------------------------------------------------------
export const duration = {
  instant: '100ms',
  fast: '150ms',
  normal: '200ms',
  moderate: '300ms',
  slow: '400ms',
  slower: '500ms',
};

export const easing = {
  default: 'cubic-bezier(0.2, 0, 0, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// ---------------------------------------------------------------------------
// Dark Theme (PRIMARY — design-first)
// Deep forest sidebar, warm dark content, emerald accents
// ---------------------------------------------------------------------------
export const darkTheme = {
  // Backgrounds & Surfaces (darkest → lightest)
  bgCanvas: '#0a0c0b',
  bgDefault: '#0c0e0d',
  bgSubtle: '#121614',
  bgMuted: '#181c1a',
  bgElevated: '#1e2422',
  bgOverlay: '#252b29',
  bgWash: '#2c3330',

  // Text Hierarchy
  textPrimary: '#f0f4f1',
  textSecondary: '#9baa9f',
  textTertiary: '#6d7f72',
  textQuaternary: '#4d5e52',
  textInverse: '#0a0c0b',

  // Borders
  borderDefault: '#253029',
  borderMuted: '#1e2722',
  borderStrong: '#3a4a40',
  borderFocus: '#10b981',

  // Accent Colors (Semantic) — Emerald & Teal
  accentPrimary: '#10b981',
  accentPrimaryHover: '#34d399',
  accentPrimaryMuted: 'rgba(16, 185, 129, 0.12)',
  accentSecondary: '#14b8a6',
  accentSecondaryHover: '#2dd4bf',
  accentSecondaryMuted: 'rgba(20, 184, 166, 0.12)',

  // Status Colors
  success: '#10b981',
  successHover: '#34d399',
  successMuted: 'rgba(16, 185, 129, 0.12)',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningMuted: 'rgba(245, 158, 11, 0.12)',
  error: '#ef4444',
  errorHover: '#f87171',
  errorMuted: 'rgba(239, 68, 68, 0.12)',
  info: '#06b6d4',
  infoHover: '#22d3ee',
  infoMuted: 'rgba(6, 182, 212, 0.12)',

  // Component-Specific: Inputs
  inputBg: '#121614',
  inputBorder: '#3a4a40',
  inputBorderHover: '#4d5e52',
  inputFocus: '#10b981',
  inputPlaceholder: '#4d5e52',

  // Component-Specific: Sidebar — Deep Forest (borderless)
  sidebarBg: '#081410',
  sidebarBgSubtle: '#0c1a14',
  sidebarBorder: 'transparent',
  sidebarItemHover: 'rgba(16, 185, 129, 0.06)',
  sidebarItemActive: 'rgba(16, 185, 129, 0.10)',
  sidebarText: '#7ba88a',
  sidebarTextHover: '#a8d4b5',
  sidebarTextActive: '#34d399',
  sidebarAccentBorder: '#10b981',
  sidebarOverline: '#3d6b4e',
  sidebarGlow: 'rgba(16, 185, 129, 0.06)',

  // Component-Specific: Navbar
  navbarBg: '#0c0e0d',
  navbarBorder: '#1e2722',

  // Component-Specific: Cards
  cardBg: '#181c1a',
  cardBorder: '#253029',
  cardBorderHover: '#3a4a40',

  // Component-Specific: Table
  tableHeaderBg: '#121614',
  tableRowHover: '#1e2422',
  tableRowAlt: '#0f1311',
  tableRowSelected: 'rgba(16, 185, 129, 0.08)',

  // Gradients — Green/Teal palette
  gradientBrand: 'linear-gradient(135deg, #10b981, #14b8a6)',
  gradientPremium: 'linear-gradient(135deg, #059669 0%, #10b981 40%, #14b8a6 70%, #06b6d4 100%)',
  gradientSubtle: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(20, 184, 166, 0.06))',
  gradientSidebar: 'linear-gradient(180deg, #081410 0%, #0a1812 50%, #081410 100%)',

  // Shadows (dark mode: softer, more spread)
  shadowSubtle: '0 1px 2px rgba(0, 0, 0, 0.3)',
  shadowCard: '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
  shadowElevated: '0 4px 12px rgba(0, 0, 0, 0.5)',
  shadowFloating: '0 8px 24px rgba(0, 0, 0, 0.6)',
  shadowModal: '0 16px 48px rgba(0, 0, 0, 0.7)',

  // Glow Effects — Emerald themed
  glowPrimary: '0 0 20px rgba(16, 185, 129, 0.25)',
  glowSuccess: '0 0 20px rgba(16, 185, 129, 0.3)',
  glowError: '0 0 20px rgba(239, 68, 68, 0.3)',
  glowSidebar: '0 0 40px rgba(16, 185, 129, 0.08)',

  // Pipeline Stage Colors
  stageApplied: '#34d399',
  stageScreening: '#2dd4bf',
  stageInterview: '#22d3ee',
  stageAssessment: '#38bdf8',
  stageOffer: '#a3e635',
  stageHired: '#10b981',
  stageRejected: '#f87171',

  // Data Visualization Palette — Nature-inspired
  chart1: '#10b981',
  chart2: '#14b8a6',
  chart3: '#06b6d4',
  chart4: '#059669',
  chart5: '#f59e0b',
  chart6: '#ec4899',
  chart7: '#f97316',
  chart8: '#8b5cf6',

  // Scrollbar
  scrollbarTrack: '#121614',
  scrollbarThumb: '#253029',
  scrollbarThumbHover: '#3a4a40',

  // Backdrop
  backdropBg: 'rgba(0, 0, 0, 0.6)',
  backdropBlur: '4px',

  // ========================================================================
  // BACKWARD COMPATIBILITY ALIASES
  // ========================================================================
  primary: '#10b981',
  primaryHover: '#34d399',
  primaryLight: 'rgba(16, 185, 129, 0.12)',
  primaryMuted: 'rgba(16, 185, 129, 0.08)',
  secondary: '#6d7f72',
  secondaryHover: '#9baa9f',
  accent: '#14b8a6',
  accentLight: 'rgba(20, 184, 166, 0.12)',
  successLight: 'rgba(16, 185, 129, 0.12)',
  warningLight: 'rgba(245, 158, 11, 0.12)',
  errorLight: 'rgba(239, 68, 68, 0.12)',
  infoLight: 'rgba(6, 182, 212, 0.12)',
  background: '#0c0e0d',
  surface1: '#181c1a',
  surface2: '#253029',
  surface3: '#3a4a40',
  text: '#f0f4f1',
  border: '#253029',
  borderHover: '#3a4a40',
  gradientButton: 'linear-gradient(135deg, #10b981, #059669)',
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.5), 0 4px 6px rgba(0, 0, 0, 0.3)',
  shadowXl: '0 20px 25px rgba(0, 0, 0, 0.5), 0 8px 10px rgba(0, 0, 0, 0.3)',
};

// ---------------------------------------------------------------------------
// Light Theme — Sage-Mint Sidebar · Warm Neutral Content
// Premium, calm, and future-ready
// ---------------------------------------------------------------------------
export const lightTheme = {
  // Backgrounds & Surfaces — Warm neutrals with organic undertone
  bgCanvas: '#f9faf8',
  bgDefault: '#ffffff',
  bgSubtle: '#f3f5f2',
  bgMuted: '#ffffff',
  bgElevated: '#ffffff',
  bgOverlay: '#f0f2ee',
  bgWash: '#e2e6e0',

  // Text Hierarchy
  textPrimary: '#1a2e22',
  textSecondary: '#4d6356',
  textTertiary: '#6d8275',
  textQuaternary: '#97ab9d',
  textInverse: '#f0f4f1',

  // Borders
  borderDefault: '#dce5dd',
  borderMuted: '#ecf0eb',
  borderStrong: '#c8d4ca',
  borderFocus: '#16a34a',

  // Accent Colors (Semantic) — Deep Green & Teal
  accentPrimary: '#16a34a',
  accentPrimaryHover: '#15803d',
  accentPrimaryMuted: 'rgba(22, 163, 74, 0.08)',
  accentSecondary: '#0d9488',
  accentSecondaryHover: '#0f766e',
  accentSecondaryMuted: 'rgba(13, 148, 136, 0.08)',

  // Status Colors
  success: '#16a34a',
  successHover: '#15803d',
  successMuted: 'rgba(22, 163, 74, 0.08)',
  warning: '#d97706',
  warningHover: '#b45309',
  warningMuted: 'rgba(217, 119, 6, 0.08)',
  error: '#dc2626',
  errorHover: '#b91c1c',
  errorMuted: 'rgba(220, 38, 38, 0.08)',
  info: '#0891b2',
  infoHover: '#0e7490',
  infoMuted: 'rgba(8, 145, 178, 0.08)',

  // Component-Specific: Inputs
  inputBg: '#ffffff',
  inputBorder: '#c8d4ca',
  inputBorderHover: '#97ab9d',
  inputFocus: '#16a34a',
  inputPlaceholder: '#97ab9d',

  // Component-Specific: Sidebar — Sage-Mint Surface (borderless)
  sidebarBg: '#eef5f0',
  sidebarBgSubtle: '#e4ede7',
  sidebarBorder: 'transparent',
  sidebarItemHover: 'rgba(22, 163, 74, 0.06)',
  sidebarItemActive: 'rgba(22, 163, 74, 0.08)',
  sidebarText: '#3d6050',
  sidebarTextHover: '#2a4634',
  sidebarTextActive: '#16a34a',
  sidebarAccentBorder: '#16a34a',
  sidebarOverline: '#8ba893',
  sidebarGlow: 'rgba(22, 163, 74, 0.04)',

  // Component-Specific: Navbar
  navbarBg: '#ffffff',
  navbarBorder: '#dce5dd',

  // Component-Specific: Cards
  cardBg: '#ffffff',
  cardBorder: '#dce5dd',
  cardBorderHover: '#c8d4ca',

  // Component-Specific: Table
  tableHeaderBg: '#f3f5f2',
  tableRowHover: '#f3f5f2',
  tableRowAlt: '#f9faf8',
  tableRowSelected: 'rgba(22, 163, 74, 0.06)',

  // Gradients — Green/Teal palette
  gradientBrand: 'linear-gradient(135deg, #16a34a, #0d9488)',
  gradientPremium: 'linear-gradient(135deg, #15803d 0%, #16a34a 40%, #0d9488 70%, #0891b2 100%)',
  gradientSubtle: 'linear-gradient(135deg, rgba(22, 163, 74, 0.05), rgba(13, 148, 136, 0.04))',
  gradientSidebar: 'linear-gradient(180deg, #eef5f0 0%, #e8f0ea 50%, #eef5f0 100%)',

  // Shadows (light mode: standard CSS shadows)
  shadowSubtle: '0 1px 2px rgba(0, 0, 0, 0.04)',
  shadowCard: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
  shadowElevated: '0 4px 12px rgba(0, 0, 0, 0.08)',
  shadowFloating: '0 8px 24px rgba(0, 0, 0, 0.12)',
  shadowModal: '0 16px 48px rgba(0, 0, 0, 0.16)',

  // Glow Effects — Green themed
  glowPrimary: '0 0 20px rgba(22, 163, 74, 0.15)',
  glowSuccess: '0 0 20px rgba(22, 163, 74, 0.15)',
  glowError: '0 0 20px rgba(220, 38, 38, 0.15)',
  glowSidebar: '0 0 40px rgba(22, 163, 74, 0.06)',

  // Pipeline Stage Colors
  stageApplied: '#16a34a',
  stageScreening: '#0d9488',
  stageInterview: '#0891b2',
  stageAssessment: '#0284c7',
  stageOffer: '#65a30d',
  stageHired: '#15803d',
  stageRejected: '#dc2626',

  // Data Visualization Palette — Nature-inspired
  chart1: '#16a34a',
  chart2: '#0d9488',
  chart3: '#0891b2',
  chart4: '#15803d',
  chart5: '#d97706',
  chart6: '#db2777',
  chart7: '#ea580c',
  chart8: '#7c3aed',

  // Scrollbar
  scrollbarTrack: '#f3f5f2',
  scrollbarThumb: '#c8d4ca',
  scrollbarThumbHover: '#97ab9d',

  // Backdrop
  backdropBg: 'rgba(0, 0, 0, 0.4)',
  backdropBlur: '4px',

  // ========================================================================
  // BACKWARD COMPATIBILITY ALIASES
  // ========================================================================
  primary: '#16a34a',
  primaryHover: '#15803d',
  primaryLight: 'rgba(22, 163, 74, 0.08)',
  primaryMuted: 'rgba(22, 163, 74, 0.06)',
  secondary: '#6d8275',
  secondaryHover: '#4d6356',
  accent: '#0d9488',
  accentLight: 'rgba(13, 148, 136, 0.08)',
  successLight: 'rgba(22, 163, 74, 0.08)',
  warningLight: 'rgba(217, 119, 6, 0.08)',
  errorLight: 'rgba(220, 38, 38, 0.08)',
  infoLight: 'rgba(8, 145, 178, 0.08)',
  background: '#ffffff',
  surface1: '#f3f5f2',
  surface2: '#e2e6e0',
  surface3: '#c8d4ca',
  text: '#1a2e22',
  border: '#dce5dd',
  borderHover: '#c8d4ca',
  gradientButton: 'linear-gradient(135deg, #16a34a, #15803d)',
  shadowSm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  shadowMd: '0 4px 6px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.04)',
  shadowLg: '0 10px 15px rgba(0, 0, 0, 0.08), 0 4px 6px rgba(0, 0, 0, 0.04)',
  shadowXl: '0 16px 48px rgba(0, 0, 0, 0.12)',
};

export type Theme = typeof darkTheme;
