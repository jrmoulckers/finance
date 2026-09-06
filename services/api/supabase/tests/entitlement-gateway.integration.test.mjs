#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

/**
 * Gateway integration suite for `entitlements-v1` (#4403).
 *
 * Handler-level unit tests cannot prove what a *deployed* request receives:
 * with gateway JWT verification enabled, Supabase refuses a missing,
 * malformed, or expired credential before the function runs and the caller
 * gets the gateway's shape instead of the documented `unauthenticated`
 * envelope. This suite drives the real local gateway so that boundary is
 * verified rather than assumed.
 *
 * It is deliberately **not** part of any fast unit run. It is invoked only by
 * `npm run test:entitlement-gateway -w services/api` and by the CI job of the
 * same name, and when it is invoked every prerequisite is mandatory: a missing
 * stack, signing key, or service credential fails the run loudly rather than
 * skipping a case.
 *
 * Configuration is discovered from the local project, never from a committed
 * credential:
 *   - the gateway port from `supabase/config.toml`
 *   - the signing key from the running auth container
 *   - the service credential from the running edge-runtime container
 *
 * The service credential is used solely to create and delete a disposable
 * local principal, so an expired token can be minted for a *real* subject. The
 * suite refuses any non-loopback gateway, so it cannot target staging or
 * production.
 *
 * @module
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const servicesApiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const configPath = path.join(servicesApiDir, 'supabase', 'config.toml');

/** Read `project_id` and the `[api]` port straight from the project config. */
function readLocalProjectConfig() {
  let config;
  try {
    config = readFileSync(configPath, 'utf8');
  } catch {
    throw new Error(`Could not read ${configPath} to locate the local gateway.`);
  }

  let section = '';
  let projectId;
  let apiPort;
  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = /^\[(.+)\]$/.exec(line);
    if (heading) {
      section = heading[1];
      continue;
    }
    const projectMatch = /^project_id\s*=\s*"([^"]+)"/.exec(line);
    if (projectMatch && section === '') projectId = projectMatch[1];
    const portMatch = /^port\s*=\s*(\d+)/.exec(line);
    if (portMatch && section === 'api') apiPort = Number(portMatch[1]);
  }

  if (!projectId) throw new Error(`Could not find project_id in ${configPath}.`);
  if (!apiPort) throw new Error(`Could not find an [api] port in ${configPath}.`);
  return { projectId, apiPort };
}

/**
 * Read one variable out of a running local container.
 *
 * Every failure is fatal. Returning a placeholder here would silently disable
 * the case that isolates expiry, which is the one this suite exists for.
 */
function readContainerVariable(container, name) {
  let output;
  try {
    output = execFileSync('docker', ['exec', container, 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    throw new Error(
      `Could not read '${name}' from container '${container}'. Start the local stack first:\n` +
        '  cd services/api\n' +
        '  supabase start\n' +
        '  supabase functions serve --env-file <local-env-file>',
      { cause },
    );
  }
  for (const line of output.split(/\r?\n/)) {
    const match = new RegExp(`^${name}=(.+)$`).exec(line.trim());
    if (match) return match[1];
  }
  throw new Error(`Container '${container}' did not expose '${name}'.`);
}

const { projectId, apiPort } = readLocalProjectConfig();

const apiRoot = process.env.ENTITLEMENTS_GATEWAY_API_ROOT ?? `http://127.0.0.1:${apiPort}`;
const { hostname } = new URL(apiRoot);
if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
  throw new Error(`Refusing to run against a non-local gateway: ${hostname}`);
}
const gatewayUrl = `${apiRoot}/functions/v1/entitlements-v1`;

const jwtSecret =
  process.env.ENTITLEMENTS_TEST_JWT_SECRET ??
  readContainerVariable(`supabase_auth_${projectId}`, 'GOTRUE_JWT_SECRET');
const serviceRoleKey =
  process.env.ENTITLEMENTS_TEST_SERVICE_ROLE_KEY ??
  readContainerVariable(`supabase_edge_runtime_${projectId}`, 'SUPABASE_SERVICE_ROLE_KEY');

/**
 * A structurally valid but untrusted JWT. It is signed with a key the project
 * does not hold, so it must be rejected exactly like a malformed one.
 */
const FORGED_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  Buffer.from(
    JSON.stringify({ sub: randomUUID(), role: 'authenticated', exp: 25340230079 }),
  ).toString('base64url'),
  'not-a-valid-signature',
].join('.');

/**
 * Mint an HS256 token against the local stack's own signing key.
 *
 * A forged signature proves only that an unverifiable token is refused. An
 * *expired but correctly signed* token exercises the other branch: the
 * signature verifies and the claim is rejected on its own merits.
 */
function mintLocalToken(expiresAtSeconds, subject) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase',
      iat: expiresAtSeconds - 3600,
      exp: expiresAtSeconds,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function variesOnOrigin(response) {
  return (response.headers.get('vary') ?? '')
    .split(',')
    .map((token) => token.trim())
    .includes('Origin');
}

async function assertUnauthenticated(label, init = {}) {
  const response = await fetch(gatewayUrl, {
    ...init,
    headers: { Origin: 'https://finance.example', ...(init.headers ?? {}) },
  });
  const body = await response.json();
  assert.equal(response.status, 401, `${label}: status`);
  assert.deepEqual(
    body,
    { error: 'Authentication required', code: 'unauthenticated' },
    `${label}: envelope`,
  );
  assert.equal(response.headers.get('content-type'), 'application/json', `${label}: content type`);
  assert.equal(response.headers.get('cache-control'), 'no-store', `${label}: cache control`);
  // The gateway may append its own tokens (for example `Accept-Encoding`), so
  // require that `Origin` is varied on rather than that it is the only token.
  assert.ok(variesOnOrigin(response), `${label}: vary on Origin`);
  assert.ok(response.headers.has('access-control-allow-origin'), `${label}: CORS header`);
}

const adminHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

test('the entitlements-v1 gateway is reachable and configured', async () => {
  let response;
  try {
    response = await fetch(gatewayUrl);
  } catch (cause) {
    throw new Error(`Could not reach ${gatewayUrl}. Is 'supabase functions serve' running?`, {
      cause,
    });
  }
  assert.notEqual(
    response.status,
    503,
    'the endpoint answered 503, so its environment is incomplete — serve the ' +
      'functions with an env file that sets ALLOWED_ORIGINS',
  );
  await response.body?.cancel();
});

test('a missing credential receives the documented unauthenticated envelope', () =>
  assertUnauthenticated('missing'));

test('a malformed credential receives the documented unauthenticated envelope', () =>
  assertUnauthenticated('malformed', { headers: { Authorization: 'Bearer not-a-jwt' } }));

test('an untrusted credential receives the documented unauthenticated envelope', () =>
  assertUnauthenticated('forged', { headers: { Authorization: `Bearer ${FORGED_JWT}` } }));

test('a non-bearer scheme receives the documented unauthenticated envelope', () =>
  assertUnauthenticated('basic', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } }));

test('expiry alone is what refuses a correctly signed credential', async () => {
  // The other cases prove an unverifiable credential is refused. This one
  // isolates *expiry*: the same real subject, the same signing key, and the
  // same claims — only `exp` differs. Without the contrast an expired token
  // could be refused for an unrelated reason and the test would still pass.
  const created = await fetch(`${apiRoot}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      email: `entitlements-gateway-${randomUUID()}@example.invalid`,
      email_confirm: true,
    }),
  });
  assert.equal(created.status, 200, 'could not provision a disposable local principal');
  const subject = (await created.json()).id;

  try {
    const now = Math.floor(Date.now() / 1000);

    const live = await fetch(gatewayUrl, {
      headers: { Authorization: `Bearer ${mintLocalToken(now + 3600, subject)}` },
    });
    const liveBody = await live.json();
    assert.notEqual(live.status, 401, 'a live credential must pass authentication');
    assert.notEqual(liveBody.code, 'unauthenticated');

    await assertUnauthenticated('expired-real-subject', {
      headers: { Authorization: `Bearer ${mintLocalToken(now - 3600, subject)}` },
    });
  } finally {
    await fetch(`${apiRoot}/auth/v1/admin/users/${subject}`, {
      method: 'DELETE',
      headers: adminHeaders,
    });
  }
});

test('an expired credential cannot read a household scope either', async () => {
  const expired = mintLocalToken(Math.floor(Date.now() / 1000) - 60, randomUUID());
  const response = await fetch(`${gatewayUrl}?household_id=30000000-0000-4000-8000-000000000002`, {
    headers: { Authorization: `Bearer ${expired}` },
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, 'unauthenticated');
  assert.ok(!JSON.stringify(body).includes('30000000'));
});

test('authorization is not weakened: no anonymous read ever succeeds', async () => {
  // The same probes with a household scope must still be refused, so
  // disabling gateway JWT verification cannot expose household state.
  const url = `${gatewayUrl}?household_id=30000000-0000-4000-8000-000000000002`;
  for (const headers of [{}, { Authorization: `Bearer ${FORGED_JWT}` }]) {
    const response = await fetch(url, { headers });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.code, 'unauthenticated');
    assert.ok(!JSON.stringify(body).includes('30000000'));
  }
});

test('a write attempt is refused as read-only, not accepted', async () => {
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: { Origin: 'https://finance.example' },
    body: JSON.stringify({ tier: 'family' }),
  });
  const body = await response.json();
  assert.equal(response.status, 405);
  assert.equal(body.code, 'method_not_allowed');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
