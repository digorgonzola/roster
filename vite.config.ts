import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built app also works when opened from a file path / any sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // /api goes to `pnpm dev:worker` (wrangler dev) during development.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
})
