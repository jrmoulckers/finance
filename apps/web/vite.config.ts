// SPDX-License-Identifier: BUSL-1.1

import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
    // Target modern browsers for smaller output
    target: 'es2022',
    // Chunk size warning at 250KB (aligned with budget.json)
    chunkSizeWarningLimit: 250,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sw: resolve(__dirname, 'src/sw/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          // React core (react + react-dom + react-router-dom)
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom') ||
            id.includes('node_modules/react/')
          ) {
            return 'vendor-react';
          }

          // Charting libraries (recharts + d3)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'vendor-charts';
          }

          // SQLite WASM (wa-sqlite + sql.js)
          if (id.includes('node_modules/wa-sqlite') || id.includes('node_modules/sql.js')) {
            return 'vendor-sqlite';
          }

          // Validation (zod)
          if (id.includes('node_modules/zod')) {
            return 'vendor-zod';
          }
        },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    headers: {
      // Strict CSP - no inline scripts, no eval
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' ws://localhost:*",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
});
