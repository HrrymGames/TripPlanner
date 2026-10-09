import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app works from any path (GitHub Pages, a sub-folder, or a file server).
export default defineConfig({
  base: './',
  plugins: [react()],
  // The bundled world gazetteer makes the app ~1.6 MB (≈700 KB gzipped); that's expected.
  build: { chunkSizeWarningLimit: 2000 },
});
