// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the auth cookie helpers (#1886).
 */

import { assertEquals, assert } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  COOKIE_PATH,
  COOKIE_PKCE,
  COOKIE_REFRESH,
  buildClearCookie,
  buildSetCookie,
  constantTimeEqual,
  isHttps,
  parseCookies,
} from './cookie.ts';

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

// ---------------------------------------------------------------------------
// buildSetCookie
// ---------------------------------------------------------------------------

Deno.test('buildSetCookie — applies standard auth attributes for an HTTP request', () => {
  const req = makeRequest('http://localhost:54321/');
  const header = buildSetCookie(req, COOKIE_REFRESH, 'token-value', { maxAgeSeconds: 600 });

  assert(header.includes('finance_refresh=token-value'));
  assert(header.includes(`Path=${COOKIE_PATH}`));
  assert(header.includes('Max-Age=600'));
  assert(header.includes('HttpOnly'));
  assert(header.includes('SameSite=Lax'));
  // No Secure when request is plain HTTP.
  assert(!header.includes('Secure'));
});

Deno.test('buildSetCookie — adds Secure for HTTPS requests', () => {
  const req = makeRequest('https://finance.example.com/api/auth/login');
  const header = buildSetCookie(req, COOKIE_REFRESH, 'value');

  assert(header.includes('Secure'));
});

Deno.test('buildSetCookie — honours X-Forwarded-Proto for proxied HTTPS', () => {
  const req = makeRequest('http://internal/', { 'x-forwarded-proto': 'https' });
  const header = buildSetCookie(req, COOKIE_REFRESH, 'value');

  assert(header.includes('Secure'));
});

Deno.test('buildSetCookie — default Max-Age is 300 seconds (PKCE window)', () => {
  const req = makeRequest('http://localhost/');
  const header = buildSetCookie(req, COOKIE_PKCE, 'value');

  assert(header.includes('Max-Age=300'));
});

// ---------------------------------------------------------------------------
// buildClearCookie
// ---------------------------------------------------------------------------

Deno.test('buildClearCookie — emits Max-Age=0 with matching Path', () => {
  const req = makeRequest('http://localhost/');
  const header = buildClearCookie(req, COOKIE_REFRESH);

  assert(header.includes('finance_refresh='));
  assert(header.includes('Max-Age=0'));
  assert(header.includes(`Path=${COOKIE_PATH}`));
  assert(header.includes('HttpOnly'));
});

// ---------------------------------------------------------------------------
// parseCookies
// ---------------------------------------------------------------------------

Deno.test('parseCookies — returns empty map when no header is present', () => {
  const cookies = parseCookies(makeRequest('http://localhost/'));
  assertEquals(cookies, {});
});

Deno.test('parseCookies — parses multiple cookies and trims whitespace', () => {
  const req = makeRequest('http://localhost/', {
    Cookie: 'finance_refresh=abc; finance_pkce=def ; other=ignored',
  });

  const cookies = parseCookies(req);
  assertEquals(cookies['finance_refresh'], 'abc');
  assertEquals(cookies['finance_pkce'], 'def');
  assertEquals(cookies['other'], 'ignored');
});

Deno.test('parseCookies — last duplicate wins (browser semantics)', () => {
  const req = makeRequest('http://localhost/', {
    Cookie: 'finance_refresh=old; finance_refresh=new',
  });
  assertEquals(parseCookies(req)['finance_refresh'], 'new');
});

// ---------------------------------------------------------------------------
// constantTimeEqual
// ---------------------------------------------------------------------------

Deno.test('constantTimeEqual — equal strings return true', () => {
  assertEquals(constantTimeEqual('abc123', 'abc123'), true);
});

Deno.test('constantTimeEqual — different strings return false', () => {
  assertEquals(constantTimeEqual('abc123', 'abc124'), false);
});

Deno.test('constantTimeEqual — different lengths return false', () => {
  assertEquals(constantTimeEqual('abc', 'abc1'), false);
});

Deno.test('constantTimeEqual — empty strings return true', () => {
  assertEquals(constantTimeEqual('', ''), true);
});

// ---------------------------------------------------------------------------
// isHttps
// ---------------------------------------------------------------------------

Deno.test('isHttps — true for https URL', () => {
  assertEquals(isHttps(makeRequest('https://example.com/')), true);
});

Deno.test('isHttps — false for http URL', () => {
  assertEquals(isHttps(makeRequest('http://example.com/')), false);
});

Deno.test('isHttps — true when X-Forwarded-Proto includes https', () => {
  const req = makeRequest('http://internal/', { 'x-forwarded-proto': 'https' });
  assertEquals(isHttps(req), true);
});
