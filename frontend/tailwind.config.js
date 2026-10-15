/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bloom cognitive level color scale (cool to warm)
        bloom: {
          remember:   '#38bdf8', // Sky 400
          understand: '#14b8a6', // Teal 500
          apply:      '#22c55e', // Green 500
          analyze:    '#eab308', // Yellow 500
          evaluate:   '#f97316', // Orange 500
          create:     '#f43f5e', // Rose 500
        },
        // Neutral Slate / Zinc Dark Theme
        zinc: {
          850: '#1f1f23',
          900: '#18181b',
          950: '#09090b',
        },
        surface: {
          DEFAULT: '#09090b', // Deep neutral background (zinc-950)
          card:    '#141418', // Raised card surface
          subtle:  '#1c1c22', // Subtle contrasting surface
          border:  '#27272a', // Subtle neutral border (zinc-800)
          hover:   '#2e2e34',
        },
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#6366f1',  // Indigo primary accent
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
        'gradient-dark':  'linear-gradient(180deg, #141418 0%, #09090b 100%)',
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
