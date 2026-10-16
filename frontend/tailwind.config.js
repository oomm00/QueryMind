/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // App / "trail map" palette (light theme; dark theme is driven by the
        // CSS variables in src/index.css via [data-theme="dark"]).
        ink:   '#1B2540',
        muted: '#5B6479',
        line:  '#D9DEE8',
        moss:  '#2E7D5B',
        amber: '#E3A008',
        rust:  '#C2410C',
        focus: '#2B6CB0',
        error: '#C2410C',
        surface: {
          DEFAULT: '#FFFFFF',
          card:    '#FFFFFF',
          subtle:  '#F5F5F5',
          border:  '#D1D5DB',
          hover:   '#F3F4F6',
        },
        // Bloom cognitive level color scale (cool to warm)
        bloom: {
          remember:   '#38bdf8', // Sky 400
          understand: '#14b8a6', // Teal 500
          apply:      '#22c55e', // Green 500
          analyze:    '#eab308', // Yellow 500
          evaluate:   '#f97316', // Orange 500
          create:     '#f43f5e', // Rose 500
        },
        brand: {
          50:  '#F2F4F8',
          100: '#E4E6ED',
          200: '#D1D5DB',
          300: '#9CA3AF',
          400: '#6B7280',
          500: '#4B5563',
        },
        zinc: {
          850: '#1f1f23',
          900: '#18181b',
          950: '#09090b',
        },
      },
      fontFamily: {
        sans:    ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
        display: ['Newsreader', 'Bricolage Grotesque', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up':   'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '.5' } },
      },
    },
  },
  plugins: [],
}
