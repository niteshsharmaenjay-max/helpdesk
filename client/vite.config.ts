import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // No path rewrite: the server itself mounts routes under /api (see
      // server/src/index.ts) since it now also serves the built client
      // directly in production, with no separate reverse proxy stripping
      // the prefix. Dev just forwards /api/* through unchanged to match.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
  },
})
