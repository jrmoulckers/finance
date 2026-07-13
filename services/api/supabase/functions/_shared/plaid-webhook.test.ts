// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Plaid webhook JWS verification (#3848).
 *
 * Generates an ephemeral ES256 key pair, signs a Plaid-style verification
 * JWT, and asserts the verifier accepts valid webhooks and rejects tampered
 * bodies, stale timestamps, wrong algorithms, and wrong keys.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { sha256Hex, verifyPlaidWebhook } from './plaid-webhook.ts';
import type { PlaidVerificationKey } from './plaid.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jsonToBase64Url(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function generateKeyPair(): Promise<{ pair: CryptoKeyPair; jwk: PlaidVerificationKey }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const exported = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const jwk: PlaidVerificationKey = {
    kty: exported.kty!,
    crv: exported.crv!,
    x: exported.x!,
    y: exported.y!,
    kid: 'test-key-1',
    alg: 'ES256',
  };
  return { pair, jwk };
}

async function signJwt(
  privateKey: CryptoKey,
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): Promise<string> {
  const headerB64 = jsonToBase64Url(header);
  const payloadB64 = jsonToBase64Url(claims);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    signingInput,
  );
  return `${headerB64}.${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function buildWebhook(
  privateKey: CryptoKey,
  body: string,
  opts: { alg?: string; kid?: string; iat?: number } = {},
): Promise<string> {
  const header = { alg: opts.alg ?? 'ES256', kid: opts.kid ?? 'test-key-1', typ: 'JWT' };
  const claims = {
    iat: opts.iat ?? Math.floor(Date.now() / 1000),
    request_body_sha256: await sha256Hex(body),
  };
  return signJwt(privateKey, header, claims);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test('accepts a correctly signed webhook with a matching body hash', async () => {
  const { pair, jwk } = await generateKeyPair();
  const body = JSON.stringify({ webhook_type: 'TRANSACTIONS', webhook_code: 'DEFAULT_UPDATE' });
  const header = await buildWebhook(pair.privateKey, body);

  const result = await verifyPlaidWebhook(body, header, { fetchKey: () => Promise.resolve(jwk) });
  assertEquals(result, true);
});

Deno.test('rejects when the body does not match the signed hash', async () => {
  const { pair, jwk } = await generateKeyPair();
  const body = JSON.stringify({ webhook_type: 'TRANSACTIONS' });
  const header = await buildWebhook(pair.privateKey, body);

  // Deliver a different body than the one that was signed.
  const tamperedBody = JSON.stringify({ webhook_type: 'ITEM' });
  const result = await verifyPlaidWebhook(tamperedBody, header, {
    fetchKey: () => Promise.resolve(jwk),
  });
  assertEquals(result, false);
});

Deno.test('rejects a stale webhook (iat outside the replay window)', async () => {
  const { pair, jwk } = await generateKeyPair();
  const body = '{}';
  const header = await buildWebhook(pair.privateKey, body, {
    iat: Math.floor(Date.now() / 1000) - 3600,
  });

  const result = await verifyPlaidWebhook(body, header, { fetchKey: () => Promise.resolve(jwk) });
  assertEquals(result, false);
});

Deno.test('rejects a non-ES256 algorithm (defense against alg confusion)', async () => {
  const { pair, jwk } = await generateKeyPair();
  const body = '{}';
  const header = await buildWebhook(pair.privateKey, body, { alg: 'none' });

  const result = await verifyPlaidWebhook(body, header, { fetchKey: () => Promise.resolve(jwk) });
  assertEquals(result, false);
});

Deno.test('rejects when signed by a different key', async () => {
  const signer = await generateKeyPair();
  const other = await generateKeyPair();
  const body = '{}';
  const header = await buildWebhook(signer.pair.privateKey, body);

  // Verifier is handed the WRONG public key.
  const result = await verifyPlaidWebhook(body, header, {
    fetchKey: () => Promise.resolve(other.jwk),
  });
  assertEquals(result, false);
});

Deno.test('rejects a missing verification header', async () => {
  const { jwk } = await generateKeyPair();
  const result = await verifyPlaidWebhook('{}', null, { fetchKey: () => Promise.resolve(jwk) });
  assertEquals(result, false);
});

Deno.test('rejects when the key cannot be resolved', async () => {
  const { pair } = await generateKeyPair();
  const body = '{}';
  const header = await buildWebhook(pair.privateKey, body);
  const result = await verifyPlaidWebhook(body, header, { fetchKey: () => Promise.resolve(null) });
  assertEquals(result, false);
});

Deno.test('rejects a malformed (non-three-part) header', async () => {
  const { jwk } = await generateKeyPair();
  const result = await verifyPlaidWebhook('{}', 'not.a.valid.jwt.token', {
    fetchKey: () => Promise.resolve(jwk),
  });
  assertEquals(result, false);
});

Deno.test('sha256Hex produces a stable lowercase hex digest', async () => {
  const digest = await sha256Hex('hello');
  assertEquals(digest, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
