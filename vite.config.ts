import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app works from any path (GitHub Pages, a sub-folder, or a file server).
export default defineConfig({
  base: './',
  plugins: [react()],
});
