import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /api requests to our Go backend during development
      '/api': {
        target: 'http://localhost:8080', // Your Go backend address
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, '') // if your Go backend doesn't expect /api prefix
      }
    }
  }
})
