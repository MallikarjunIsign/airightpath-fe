/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ====================================================================
      // Typography
      // ====================================================================
      fontFamily: {
        heading: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
      },
      fontSize: {
        'display-xl': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.04em', fontWeight: '800' }],
        'display': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '700' }],
        'heading-1': ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.025em', fontWeight: '700' }],
        'heading-2': ['1.5rem', { lineHeight: '1.25', letterSpacing: '-0.02em', fontWeight: '600' }],
        'heading-3': ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '600' }],
        'heading-4': ['1rem', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.6', letterSpacing: '-0.006em' }],
        'body': ['0.875rem', { lineHeight: '1.6', letterSpacing: '-0.006em' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.55', letterSpacing: '0' }],
        'caption': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.02em', fontWeight: '500' }],
        'overline': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '600' }],
      },

      // ====================================================================
      // Border Radius
      // ====================================================================
      borderRadius: {
        card: '12px',
        button: '8px',
        input: '8px',
        badge: '6px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },

      // ====================================================================
      // Shadows (mapped to CSS vars for theme-awareness)
      // ====================================================================
      boxShadow: {
        'subtle': 'var(--shadowSubtle)',
        'card': 'var(--shadowCard)',
        'card-hover': 'var(--shadowElevated)',
        'elevated': 'var(--shadowElevated)',
        'floating': 'var(--shadowFloating)',
        'modal': 'var(--shadowModal)',
        'glow-primary': 'var(--glowPrimary)',
        'glow-success': 'var(--glowSuccess)',
        'glow-error': 'var(--glowError)',
        'glow-sidebar': 'var(--glowSidebar)',
        // Backward compatibility
        'sm': 'var(--shadowSubtle)',
        'md': 'var(--shadowCard)',
        'lg': 'var(--shadowElevated)',
        'xl': 'var(--shadowModal)',
      },

      // ====================================================================
      // Colors — Sage/Emerald/Teal nature-inspired palette
      // ====================================================================
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        accent: {
          DEFAULT: '#0d9488',
          light: 'rgba(13, 148, 136, 0.12)',
          50: '#f0fdfa',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        sage: {
          50: '#f3f7f4',
          100: '#e4ede7',
          200: '#d0ddd3',
          300: '#b0c4b5',
          400: '#8ba893',
          500: '#6d8a75',
          600: '#5a7a67',
          700: '#466150',
          800: '#3a5c44',
          900: '#2d4836',
          950: '#1a2e22',
        },
        teal: {
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
      },

      // ====================================================================
      // Spacing (additional values)
      // ====================================================================
      spacing: {
        '4.5': '1.125rem',   // 18px
        '13': '3.25rem',     // 52px
        '15': '3.75rem',     // 60px
        '18': '4.5rem',      // 72px
        '22': '5.5rem',      // 88px
      },

      // ====================================================================
      // Widths
      // ====================================================================
      width: {
        sidebar: '15rem',           // 240px
        'sidebar-collapsed': '4.5rem', // 72px
      },

      // ====================================================================
      // Max Widths
      // ====================================================================
      maxWidth: {
        'content': '90rem',   // 1440px
        'modal-sm': '30rem',  // 480px
        'modal-md': '40rem',  // 640px
        'modal-lg': '50rem',  // 800px
        'toast': '22.5rem',   // 360px
      },

      // ====================================================================
      // Heights
      // ====================================================================
      height: {
        navbar: '3.5rem',     // 56px
        'input': '2.75rem',   // 44px
        'input-sm': '2rem',   // 32px
        'input-lg': '3rem',   // 48px
        'row': '3rem',        // 48px (table row)
      },

      // ====================================================================
      // Animations & Keyframes
      // ====================================================================
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'scale-out': {
          from: { opacity: '1', transform: 'scale(1)' },
          to: { opacity: '0', transform: 'scale(0.95)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { opacity: '1', transform: 'translateX(0)' },
          to: { opacity: '0', transform: 'translateX(16px)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-bottom': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-top': {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(16, 185, 129, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)' },
        },
        'sidebar-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'accordion-down': {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
          to: { height: '0', opacity: '0' },
        },
        'tab-indicator': {
          from: { transform: 'var(--tab-indicator-from, translateX(0))' },
          to: { transform: 'var(--tab-indicator-to, translateX(0))' },
        },
        'notification-ping': {
          '75%, 100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      animation: {
        // Entrances
        'fade-in': 'fade-in 200ms cubic-bezier(0, 0, 0.2, 1)',
        'fade-in-up': 'fade-in-up 300ms cubic-bezier(0, 0, 0.2, 1)',
        'fade-in-down': 'fade-in-down 300ms cubic-bezier(0, 0, 0.2, 1)',
        'scale-in': 'scale-in 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slide-in-right 300ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-in-left': 'slide-in-left 300ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-in-bottom': 'slide-in-bottom 300ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-in-top': 'slide-in-top 300ms cubic-bezier(0, 0, 0.2, 1)',

        // Exits
        'fade-out': 'fade-out 150ms cubic-bezier(0.4, 0, 1, 1)',
        'scale-out': 'scale-out 150ms cubic-bezier(0.4, 0, 1, 1)',
        'slide-out-right': 'slide-out-right 200ms cubic-bezier(0.4, 0, 1, 1)',

        // Loops
        'shimmer': 'shimmer 2s linear infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'sidebar-glow': 'sidebar-glow 4s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'notification-ping': 'notification-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',

        // Radix UI
        'accordion-down': 'accordion-down 300ms cubic-bezier(0.22, 1, 0.36, 1)',
        'accordion-up': 'accordion-up 200ms cubic-bezier(0.4, 0, 1, 1)',
      },

      // ====================================================================
      // Transitions
      // ====================================================================
      transitionDuration: {
        'instant': '100ms',
        'fast': '150ms',
        'normal': '200ms',
        'moderate': '300ms',
        'slow': '400ms',
      },
      transitionTimingFunction: {
        'default': 'cubic-bezier(0.2, 0, 0, 1)',
        'spring': 'cubic-bezier(0.22, 1, 0.36, 1)',
        'bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      // ====================================================================
      // Z-Index Scale
      // ====================================================================
      zIndex: {
        'sidebar': '50',
        'navbar': '40',
        'dropdown': '60',
        'modal-backdrop': '70',
        'modal': '80',
        'toast': '90',
        'command-palette': '100',
        'tooltip': '110',
      },
    },
  },
  plugins: [],
};
