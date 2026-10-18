import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy API calls to backend in dev — avoids CORS issues
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // The tests run in jsdom; the content pipeline's own tests are plain Node.
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx}', 'scripts/**/*.test.js'],
    restoreMocks: true,
  },
})
