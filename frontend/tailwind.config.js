/**
 * Tailwind configuration — maps the design tokens (defined as CSS variables in
 * src/index.css) into utility classes. Theming is driven entirely by the
 * variables, so `[data-theme="dark"]` re-skins the app without dark: variants.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: {
          DEFAULT: 'var(--surface)',
          raised: 'var(--surface-2)',
        },
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          tint: 'var(--primary-tint)',
          fg: 'var(--on-primary)',
        },
        success: {
          DEFAULT: 'var(--success)',
          tint: 'var(--success-tint)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          tint: 'var(--warning-tint)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          tint: 'var(--danger-tint)',
        },
        focus: 'var(--focus)',
        overlay: 'var(--overlay)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        control: '8px',
        panel: '12px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        // Used sparingly (popovers, command palette, toasts). No heavy shadows.
        pop: '0 10px 30px rgba(0, 0, 0, 0.12)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
