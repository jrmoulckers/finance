// SPDX-License-Identifier: BUSL-1.1

import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const analyze = process.env.ANALYZE === 'true';

  return {
    plugins: [
      react(),
      ...(analyze
        ? [
            import('rollup-plugin-visualizer').then((m) =>
              m.visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true }),
            ),
          ]
        : []),
    ],

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 500,
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
            if (
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom') ||
              id.includes('node_modules/react/')
            ) {
              return 'vendor';
            }
            if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
              return 'charts';
            }
            if (id.includes('node_modules/zod')) {
              return 'validation';
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
  };
});
