// SPDX-License-Identifier: BUSL-1.1

/**
 * Design Token Preview — Dev Server with Hot Reload
 *
 * Generates the token preview HTML, serves it on localhost, and watches the
 * token JSON files for changes. On change it regenerates and pushes a reload
 * event via Server-Sent Events (SSE).
 *
 * Usage:
 *   node tools/token-preview-serve.mjs              # default port 3333
 *   node tools/token-preview-serve.mjs --port 4000
 *   node tools/token-preview-serve.mjs --help
 */

import http from 'http';
import { readFileSync, watch } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generate } from './token-preview-generate.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST = join(__dirname, '..', 'packages', 'design-tokens', 'build', 'preview');
const TOKENS = join(__dirname, '..', 'packages', 'design-tokens', 'tokens');

// ── CLI args ─────────────────────────────────────────────────────────

if (process.argv.includes('--help')) {
  console.log('Usage: node tools/token-preview-serve.mjs [--port N]');
  console.log('Starts a dev server with hot reload for the design token preview.');
  process.exit(0);
}

const portFlag = process.argv.indexOf('--port');
const PORT = portFlag !== -1 ? parseInt(process.argv[portFlag + 1], 10) || 3333 : 3333;

// ── Initial generation ───────────────────────────────────────────────

generate({ liveReload: true });

// ── SSE clients ──────────────────────────────────────────────────────

const clients = new Set();

function sendReload() {
  for (const res of clients) {
    res.write('data: reload\n\n');
  }
}

// ── File watcher ─────────────────────────────────────────────────────

let debounce = null;

const watcher = watch(TOKENS, { recursive: true }, (_event, filename) => {
  if (!filename || !filename.endsWith('.json')) return;
  // Debounce rapid successive changes (e.g. editor save + format)
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    console.log(`\n  \u2728 Token changed: ${filename}`);
    try {
      generate({ liveReload: true });
      sendReload();
    } catch (err) {
      console.error('  \u274C Regeneration failed:', err.message);
    }
  }, 200);
});

// ── HTTP server ──────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // SSE endpoint for live reload
  if (req.url === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(':ok\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Serve the generated HTML
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = readFileSync(join(DIST, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Preview not generated. Check console for errors.');
    }
    return;
  }

  // 404 for everything else (favicon, etc.)
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log('');
  console.log(`  \uD83C\uDFA8 Finance Token Preview`);
  console.log(`  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Watching: packages/design-tokens/tokens/`);
  console.log(`  Press Ctrl+C to stop.`);
  console.log('');
});

// ── Graceful shutdown ────────────────────────────────────────────────

function shutdown() {
  console.log('\n  Shutting down...');
  watcher.close();
  for (const c of clients) c.end();
  server.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
