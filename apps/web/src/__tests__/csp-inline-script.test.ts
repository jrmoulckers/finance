// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression guard for #3105 / #3210.
 *
 * The service-worker auto-update driver (#2023) once lived as an inline
 * `<script>` in index.html. That inline script was allowed by the dev CSP
 * (`'unsafe-inline'`) but BLOCKED by the strict production/staging CSP
 * (`script-src 'self' 'wasm-unsafe-eval'`, no `'unsafe-inline'`, no hash),
 * so `SKIP_WAITING` was never posted and users stayed pinned to stale
 * bundles after every deploy (#3105).
 *
 * The fix externalized the driver to /sw-update.js so it is covered by
 * `script-src 'self'` with no CSP relaxation. These tests fail loudly if
 * anyone re-introduces an inline script or weakens the deployed CSP.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexHtml = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
const caddyfile = readFileSync(resolve(__dirname, '../../../../deploy/Caddyfile'), 'utf-8');
const caddyfileStaging = readFileSync(
  resolve(__dirname, '../../../../deploy/Caddyfile.staging'),
  'utf-8',
);

/**
 * Remove HTML comments with a simple character scanner rather than a regex.
 * Regex-based multi-character stripping is unreliable (and flagged by static
 * analysis) because a single pass can leave partial delimiters behind; a
 * left-to-right scan removes every comment span deterministically.
 */
function stripHtmlComments(html: string): string {
  let result = '';
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<!--', cursor);
    if (start === -1) {
      result += html.slice(cursor);
      break;
    }
    result += html.slice(cursor, start);
    const end = html.indexOf('-->', start + 4);
    if (end === -1) {
      // Unterminated comment: drop the remainder.
      break;
    }
    cursor = end + 3;
  }
  return result;
}

/**
 * Collect the body of every non-external <script> tag using a manual scan.
 * External scripts (those carrying a `src` attribute) are ignored — only
 * inline executable bodies are of interest for the CSP regression guard.
 */
function inlineScriptBodies(html: string): string[] {
  const bodies: string[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;
  while (cursor < lower.length) {
    const open = lower.indexOf('<script', cursor);
    if (open === -1) {
      break;
    }
    const openTagEnd = lower.indexOf('>', open);
    if (openTagEnd === -1) {
      break;
    }
    const openTag = lower.slice(open, openTagEnd + 1);
    const close = lower.indexOf('</script', openTagEnd);
    const bodyEnd = close === -1 ? html.length : close;
    if (!openTag.includes('src=')) {
      bodies.push(html.slice(openTagEnd + 1, bodyEnd));
    }
    if (close === -1) {
      break;
    }
    const closeTagEnd = lower.indexOf('>', close);
    cursor = closeTagEnd === -1 ? html.length : closeTagEnd + 1;
  }
  return bodies;
}

describe('CSP / inline-script regression guard (#3105, #3210)', () => {
  describe('index.html', () => {
    it('must not contain any inline <script> with executable body content', () => {
      // Strip HTML comments first — the file documents the history with the
      // literal text "<script>" inside a comment, which is not executable.
      const withoutComments = stripHtmlComments(indexHtml);
      for (const body of inlineScriptBodies(withoutComments)) {
        expect(body.trim()).toBe('');
      }
    });

    it('must load the service-worker update driver from an external file', () => {
      expect(indexHtml).toContain('src="/sw-update.js"');
    });
  });

  describe('deployed Content-Security-Policy', () => {
    const cspLineOf = (caddy: string): string =>
      caddy.split('\n').find((line) => line.includes('Content-Security-Policy')) ?? '';

    for (const [name, caddy] of [
      ['production Caddyfile', caddyfile],
      ['staging Caddyfile', caddyfileStaging],
    ] as const) {
      it(`${name} script-src must self-host scripts (allows /sw-update.js)`, () => {
        const csp = cspLineOf(caddy);
        expect(csp).toContain("script-src 'self'");
      });

      it(`${name} must NOT relax script-src with 'unsafe-inline'`, () => {
        const csp = cspLineOf(caddy);
        // Guard specifically the script-src directive against 'unsafe-inline'.
        const scriptSrc = csp.slice(csp.indexOf('script-src'));
        const directiveEnd = scriptSrc.indexOf(';');
        const scriptDirective = directiveEnd === -1 ? scriptSrc : scriptSrc.slice(0, directiveEnd);
        expect(scriptDirective).not.toContain("'unsafe-inline'");
      });
    }
  });
});
