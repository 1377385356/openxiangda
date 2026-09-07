import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const connectedProxy =
  process.env.OPENXIANGDA_DEV_PROXY?.trim() || 'http://127.0.0.1:7001';
const port = Number(process.env.OPENXIANGDA_WEB_PORT || 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    proxy: {
      '/service': { target: connectedProxy, changeOrigin: false },
      '/api': { target: connectedProxy, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          refine: ['@refinedev/core'],
        },
      },
    },
  },
});
