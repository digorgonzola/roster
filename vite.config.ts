import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built app also works when opened from a file path / any sub-folder.
export default defineConfig({
  base: './',
  plugins: [react()],
})
