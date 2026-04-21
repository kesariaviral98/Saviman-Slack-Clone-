import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  server: {
    port: 5173,
    // In development, proxy all API and WebSocket traffic to the Express server
    // so the client can use relative paths and avoids CORS pre-flight issues.
    proxy: {
      // For routes that overlap with React Router paths, use bypass so that
      // browser page-refresh requests (Accept: text/html) are served by Vite
      // as the SPA shell instead of being forwarded to the backend API.
      '/workspaces': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
      '/invite': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) return '/index.html';
        },
      },
      '/auth':          { target: 'http://localhost:4000', changeOrigin: true },
      '/channels':      { target: 'http://localhost:4000', changeOrigin: true },
      '/search':        { target: 'http://localhost:4000', changeOrigin: true },
      '/notifications': { target: 'http://localhost:4000', changeOrigin: true },
      '/calls':         { target: 'http://localhost:4000', changeOrigin: true },
      '/messages':      { target: 'http://localhost:4000', changeOrigin: true },
      '/admin':         { target: 'http://localhost:4000', changeOrigin: true },
      '/health':        { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
