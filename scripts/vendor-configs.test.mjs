import assert from 'node:assert/strict';
import test from 'node:test';
import { apiHeaders, highestSemver, latestRef } from './vendor-configs.mjs';

/** Stubs global fetch with a map of URL substring -> response descriptor. */
function stubFetch(routes) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const key = Object.keys(routes).find((part) => String(url).includes(part));
    const route = key ? routes[key] : { status: 404 };
    if (route.throws) throw new Error(route.throws);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      headers: { get: (name) => (route.headers ?? {})[name] ?? null },
      json: async () => route.body,
    };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const releaseBody = (tag) => ({ tag_name: tag });
const tagBody = (names) => names.map((name) => ({ name }));

test('highestSemver compares numerically, not lexically', () => {
  // A lexical sort puts v0.9.0 above v0.122.0, which is how a fleet-wide audit
  // once resolved refs to the wrong tag.
  assert.equal(highestSemver(['v0.9.0', 'v0.122.0', 'v0.15.3']), 'v0.122.0');
});

test('highestSemver ignores non-semver refs rather than throwing', () => {
  assert.equal(highestSemver(['archive/public-consumption', 'v1.2.3']), 'v1.2.3');
});

test('highestSemver returns null when nothing parses', () => {
  assert.equal(highestSemver([]), null);
  assert.equal(highestSemver(['main', 'archive/x']), null);
});

test('highestSemver orders by minor and patch, not just major', () => {
  assert.equal(highestSemver(['v0.134.0', 'v0.133.0']), 'v0.134.0');
  assert.equal(highestSemver(['v1.0.10', 'v1.0.9']), 'v1.0.10');
});

test('apiHeaders sends a bearer token when one is present', (t) => {
  t.after(() => {
    delete process.env.GITHUB_TOKEN;
  });
  process.env.GITHUB_TOKEN = 'x';
  assert.equal(apiHeaders().authorization, 'Bearer x');
});

test('apiHeaders omits authorization when no token is set', () => {
  const saved = [process.env.GITHUB_TOKEN, process.env.GH_TOKEN];
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  assert.equal('authorization' in apiHeaders(), false);
  if (saved[0] !== undefined) process.env.GITHUB_TOKEN = saved[0];
  if (saved[1] !== undefined) process.env.GH_TOKEN = saved[1];
});

test('a tag newer than releases/latest wins, which is the live upstream case', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 200, body: releaseBody('v0.133.0') },
    tags: { status: 200, body: tagBody(['v0.134.0', 'v0.133.0']) },
  });
  t.after(stub.restore);
  assert.deepEqual(await latestRef(), { ref: 'v0.134.0', reason: null });
});

test('the release flag wins when tags lag, so neither source is trusted alone', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 200, body: releaseBody('v2.0.0') },
    tags: { status: 200, body: tagBody(['v1.0.0']) },
  });
  t.after(stub.restore);
  assert.equal((await latestRef()).ref, 'v2.0.0');
});

test('a rate-limited response names the limit and the remedy', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    tags: { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
  });
  t.after(stub.restore);
  const result = await latestRef();
  assert.equal(result.ref, null);
  assert.match(result.reason, /rate limit/);
  assert.match(result.reason, /GITHUB_TOKEN/);
});

test('a non-rate-limit failure reports its status instead of blaming the limit', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 404 },
    tags: { status: 404 },
  });
  t.after(stub.restore);
  const result = await latestRef();
  assert.equal(result.ref, null);
  assert.match(result.reason, /HTTP 404/);
  assert.doesNotMatch(result.reason, /rate limit/);
});

test('an unreachable API produces a reason rather than a silent null', async (t) => {
  const stub = stubFetch({
    'releases/latest': { throws: 'ENOTFOUND' },
    tags: { throws: 'ENOTFOUND' },
  });
  t.after(stub.restore);
  const result = await latestRef();
  assert.equal(result.ref, null);
  assert.match(result.reason, /could not reach/);
});

test('one source failing does not suppress the other', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 404 },
    tags: { status: 200, body: tagBody(['v3.1.4']) },
  });
  t.after(stub.restore);
  assert.deepEqual(await latestRef(), { ref: 'v3.1.4', reason: null });
});

test('a successful answer never carries a reason, so callers cannot print both', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 200, body: releaseBody('v1.0.0') },
    tags: { status: 200, body: tagBody(['v1.0.0']) },
  });
  t.after(stub.restore);
  assert.equal((await latestRef()).reason, null);
});

test('both sources are queried, so a release-less tag cannot hide', async (t) => {
  const stub = stubFetch({
    'releases/latest': { status: 200, body: releaseBody('v1.0.0') },
    tags: { status: 200, body: tagBody(['v1.0.0']) },
  });
  t.after(stub.restore);
  await latestRef();
  assert.equal(
    stub.calls.some((c) => c.url.includes('releases/latest')),
    true,
  );
  assert.equal(
    stub.calls.some((c) => c.url.includes('/tags')),
    true,
  );
});
