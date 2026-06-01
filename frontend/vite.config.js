import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:8000',
      '/trips': 'http://localhost:8000',
      '/share': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
    }
  }
})
