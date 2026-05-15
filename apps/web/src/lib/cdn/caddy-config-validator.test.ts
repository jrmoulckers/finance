// SPDX-License-Identifier: BUSL-1.1

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hasCompression, hasSecurityHeader, parseCaddyDirectives } from './caddy-config-validator';
import {
  CACHE_CONTROL_HTML,
  CACHE_CONTROL_IMMUTABLE,
  CACHE_CONTROL_MANIFEST,
  CACHE_CONTROL_SERVICE_WORKER,
} from './cache-policy';

// ---------------------------------------------------------------------------
// Load the actual Caddyfile from the deploy directory
// ---------------------------------------------------------------------------

const CADDYFILE_PATH = resolve(__dirname, '../../../../../deploy/Caddyfile');
const caddyfileContent = readFileSync(CADDYFILE_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('parseCaddyDirectives', () => {
  it('extracts route-level handle blocks', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const routes = directives.map((d) => d.route);

    expect(routes).toContain('/sw.js');
    expect(routes).toContain('/manifest.json');
    expect(routes).toContain('/assets/*');
  });

  it('extracts Cache-Control headers from route blocks', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const swDirective = directives.find((d) => d.route === '/sw.js');
    const manifestDirective = directives.find((d) => d.route === '/manifest.json');
    const assetsDirective = directives.find((d) => d.route === '/assets/*');

    expect(swDirective?.cacheControl).toBeDefined();
    expect(manifestDirective?.cacheControl).toBeDefined();
    expect(assetsDirective?.cacheControl).toBeDefined();
  });

  it('detects file_server usage in static routes', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const swDirective = directives.find((d) => d.route === '/sw.js');
    const assetsDirective = directives.find((d) => d.route === '/assets/*');

    expect(swDirective?.hasFileServer).toBe(true);
    expect(assetsDirective?.hasFileServer).toBe(true);
  });

  it('detects try_files in the SPA fallback route', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const fallback = directives.find((d) => d.route === '/*');

    expect(fallback?.hasTryFiles).toBe(true);
  });

  it('detects reverse_proxy in API routes', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const restRoute = directives.find((d) => d.route === '/rest/v1/*');
    const authRoute = directives.find((d) => d.route === '/auth/v1/*');
    const functionsRoute = directives.find((d) => d.route === '/functions/v1/*');

    expect(restRoute?.hasReverseProxy).toBe(true);
    expect(authRoute?.hasReverseProxy).toBe(true);
    expect(functionsRoute?.hasReverseProxy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Caddy ↔ TypeScript cache policy synchronisation
// ---------------------------------------------------------------------------

describe('Caddy ↔ TypeScript cache policy sync', () => {
  it('service worker Cache-Control matches TypeScript constant', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const swDirective = directives.find((d) => d.route === '/sw.js');

    expect(swDirective?.cacheControl).toBe(CACHE_CONTROL_SERVICE_WORKER);
  });

  it('manifest Cache-Control matches TypeScript constant', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const manifestDirective = directives.find((d) => d.route === '/manifest.json');

    expect(manifestDirective?.cacheControl).toBe(CACHE_CONTROL_MANIFEST);
  });

  it('hashed assets Cache-Control matches TypeScript constant', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const assetsDirective = directives.find((d) => d.route === '/assets/*');

    expect(assetsDirective?.cacheControl).toBe(CACHE_CONTROL_IMMUTABLE);
  });

  it('SPA fallback Cache-Control matches TypeScript constant', () => {
    const directives = parseCaddyDirectives(caddyfileContent);
    const fallback = directives.find((d) => d.route === '/*');

    expect(fallback?.cacheControl).toBe(CACHE_CONTROL_HTML);
  });
});

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

describe('Compression', () => {
  it('Caddyfile enables gzip and/or zstd compression', () => {
    expect(hasCompression(caddyfileContent)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

describe('Security headers in Caddyfile', () => {
  it('sets Strict-Transport-Security', () => {
    expect(hasSecurityHeader(caddyfileContent, 'Strict-Transport-Security')).toBe(true);
  });

  it('sets X-Content-Type-Options', () => {
    expect(hasSecurityHeader(caddyfileContent, 'X-Content-Type-Options')).toBe(true);
  });

  it('sets X-Frame-Options', () => {
    expect(hasSecurityHeader(caddyfileContent, 'X-Frame-Options')).toBe(true);
  });

  it('sets Referrer-Policy', () => {
    expect(hasSecurityHeader(caddyfileContent, 'Referrer-Policy')).toBe(true);
  });

  it('sets Content-Security-Policy', () => {
    expect(hasSecurityHeader(caddyfileContent, 'Content-Security-Policy')).toBe(true);
  });

  it('sets Permissions-Policy', () => {
    expect(hasSecurityHeader(caddyfileContent, 'Permissions-Policy')).toBe(true);
  });

  it('removes Server header', () => {
    expect(caddyfileContent).toContain('-Server');
  });

  it('CSP disallows eval', () => {
    // The CSP should not contain unsafe-eval
    const cspLine = caddyfileContent
      .split('\n')
      .find((line) => line.includes('Content-Security-Policy'));
    expect(cspLine).toBeDefined();
    expect(cspLine).not.toContain('unsafe-eval');
  });

  it('CSP allows worker-src self for service worker', () => {
    const cspLine = caddyfileContent
      .split('\n')
      .find((line) => line.includes('Content-Security-Policy'));
    expect(cspLine).toContain("worker-src 'self'");
  });
});
