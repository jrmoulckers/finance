import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiHeaders,
  highestSemver,
  divergenceNotice,
  latestRef,
  MAX_TAG_PAGES,
  nextPageUrl,
} from './vendor-configs.mjs';

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
  const { ref, reason, notice } = await latestRef();
  assert.deepEqual({ ref, reason }, { ref: 'v0.134.0', reason: null });
  assert.equal(typeof notice === 'string' || notice === null, true);
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
  const { ref, reason, notice } = await latestRef();
  assert.deepEqual({ ref, reason }, { ref: 'v3.1.4', reason: null });
  assert.equal(typeof notice === 'string' || notice === null, true);
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

test('nextPageUrl finds the next link among several relations', () => {
  const header =
    '<https://api.github.com/repositories/1/tags?page=3>; rel="next", ' +
    '<https://api.github.com/repositories/1/tags?page=9>; rel="last"';
  assert.equal(nextPageUrl(header), 'https://api.github.com/repositories/1/tags?page=3');
});

test('nextPageUrl returns null on the last page and on a missing header', () => {
  assert.equal(nextPageUrl('<https://api.github.com/x?page=1>; rel="prev"'), null);
  assert.equal(nextPageUrl(null), null);
  assert.equal(nextPageUrl(undefined), null);
});

test('the highest tag is found when it sits beyond the first page', async (t) => {
  // The live failure this guards: upstream passed 100 tags while the tool asked
  // for a single 100-entry page. It stayed correct only because GitHub returns
  // tags newest-created first and this repo tags in ascending order. A repo that
  // backports creates low versions last, putting the frontier on a later page.
  const stub = stubFetch({
    'tags?per_page=100': {
      status: 200,
      body: tagBody(['v0.9.0', 'v0.8.0']),
      headers: { link: '<https://api.github.com/repos/x/y/tags?page=2>; rel="next"' },
    },
    'tags?page=2': { status: 200, body: tagBody(['v0.136.0', 'v0.135.0']) },
    'releases/latest': { status: 200, body: releaseBody('v0.100.0') },
  });
  t.after(stub.restore);
  const { ref, reason, notice } = await latestRef();
  assert.deepEqual({ ref, reason }, { ref: 'v0.136.0', reason: null });
  assert.equal(typeof notice === 'string' || notice === null, true);
  assert.ok(stub.calls.some((call) => call.url.includes('page=2')));
});

test('a later page failing does not yield a maximum over the pages that loaded', async (t) => {
  // Returning v0.9.0 here would be a smaller answer wearing an authoritative
  // shape -- the exact silence this tool exists to remove, one layer down.
  const stub = stubFetch({
    'tags?per_page=100': {
      status: 200,
      body: tagBody(['v0.9.0']),
      headers: { link: '<https://api.github.com/repos/x/y/tags?page=2>; rel="next"' },
    },
    'tags?page=2': { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    'releases/latest': { status: 500 },
  });
  t.after(stub.restore);
  const result = await latestRef();
  assert.equal(result.ref, null);
  assert.match(result.reason, /rate limit exhausted/);
  assert.match(result.reason, /HTTP 500/);
});

test('an endless next chain stops at the cap and names it', async (t) => {
  const stub = stubFetch({
    tags: {
      status: 200,
      body: tagBody(['v0.1.0']),
      headers: { link: '<https://api.github.com/repos/x/y/tags?page=2>; rel="next"' },
    },
    'releases/latest': { status: 404 },
  });
  t.after(stub.restore);
  const result = await latestRef();
  assert.equal(result.ref, null);
  assert.match(result.reason, /exceeded 30 pages/);
  assert.match(result.reason, /HTTP 404/);
  assert.equal(stub.calls.filter((call) => call.url.includes('tags')).length, MAX_TAG_PAGES);
});

test('a single-page tag list issues exactly one tag request', async (t) => {
  const stub = stubFetch({
    'tags?per_page=100': { status: 200, body: tagBody(['v0.2.0', 'v0.10.0']) },
    'releases/latest': { status: 200, body: releaseBody('v0.2.0') },
  });
  t.after(stub.restore);
  const { ref, reason, notice } = await latestRef();
  assert.deepEqual({ ref, reason }, { ref: 'v0.10.0', reason: null });
  assert.equal(typeof notice === 'string' || notice === null, true);
  assert.equal(stub.calls.filter((call) => call.url.includes('tags')).length, 1);
});

test('agreement between the declared and derived ref produces no notice', () => {
  assert.equal(divergenceNotice('v1.2.3', 'v1.2.3'), null);
});

test('a missing side produces no notice, because there is no disagreement to report', () => {
  assert.equal(divergenceNotice(null, 'v1.2.3'), null);
  assert.equal(divergenceNotice('v1.2.3', null), null);
  assert.equal(divergenceNotice(null, null), null);
});

test('a tag ahead of the release names the in-flight publish as the likely cause', () => {
  const notice = divergenceNotice('v0.143.0', 'v0.144.0');
  assert.match(notice, /tag v0\.144\.0 is ahead of releases\/latest v0\.143\.0/);
  assert.match(notice, /in flight/);
});

test('a tag ahead of the release still names the permanent cause, as the rarer one', () => {
  // Both causes must appear: a notice that named only the benign one would be a
  // reassurance rather than a report. The ordering carries the base rate.
  const notice = divergenceNotice('v0.143.0', 'v0.144.0');
  assert.match(notice, /never published/);
  assert.ok(notice.indexOf('in flight') < notice.indexOf('never published'));
});

test('a release ahead of the highest tag is reported as an incomplete tag walk', () => {
  // A release cannot exist without its tag, so this direction is evidence about
  // the tag read, not about the release. Blaming the release would send the
  // reader to the wrong system.
  const notice = divergenceNotice('v0.144.0', 'v0.143.0');
  assert.match(notice, /tag list as incomplete/);
  assert.doesNotMatch(notice, /in flight/);
});

test('the notice compares by semver, not by string order', () => {
  // 'v0.9.0' > 'v0.10.0' lexically. If the direction were decided by string
  // comparison this would render the in-flight wording backwards.
  const notice = divergenceNotice('v0.9.0', 'v0.10.0');
  assert.match(notice, /tag v0\.10\.0 is ahead/);
});
