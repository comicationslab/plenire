import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development the browser talks to this app, and Vite forwards API calls to the backend (no CORS setup needed).
    proxy: { '/api': 'http://localhost:8787', '/auth': 'http://localhost:8787' },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
