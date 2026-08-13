import assert from 'node:assert/strict';
import test from 'node:test';

import { contextLines, extractIndexUrl, refMutability } from './citations-context.mjs';

const REAL = 'https://raw.githubusercontent.com/jrmoulckers/engineering/main/principles/index.json';
const PINNED =
  'https://raw.githubusercontent.com/jrmoulckers/engineering/8d4f2a1c9b0e7d6f5a4c3b2e1d0f9a8b7c6d5e4f/principles/index.json';

test('extractIndexUrl returns the URL when exactly one candidate exists', () => {
  const { url, matches } = extractIndexUrl(`const INDEX =\n  '${REAL}';\n`);
  assert.equal(url, REAL);
  assert.equal(matches, 1);
});

test('extractIndexUrl refuses to guess when two distinct candidates exist', () => {
  const { url, matches } = extractIndexUrl(`'${REAL}' '${PINNED}'`);
  assert.equal(url, null, 'two candidates must not resolve to one of them');
  assert.equal(matches, 2);
});

test('extractIndexUrl collapses repeats of the same URL to one candidate', () => {
  const { url, matches } = extractIndexUrl(`'${REAL}' and again '${REAL}'`);
  assert.equal(url, REAL);
  assert.equal(matches, 1, 'the same literal twice is still one authority');
});

test('extractIndexUrl reports zero rather than throwing when the constant is gone', () => {
  const { url, matches } = extractIndexUrl('const INDEX = process.env.INDEX_URL;');
  assert.equal(url, null);
  assert.equal(matches, 0);
});

test('extractIndexUrl is not left stateful by a previous call', () => {
  extractIndexUrl(`'${REAL}' '${PINNED}'`);
  const second = extractIndexUrl(`'${REAL}'`);
  assert.equal(second.matches, 1, 'a global regex must be reset between calls');
});

test('extractIndexUrl stops at the quote, not at the end of the line', () => {
  const { url } = extractIndexUrl(`const INDEX = '${REAL}';`);
  assert.equal(url, REAL, 'trailing quote and semicolon must not be captured');
});

test('refMutability calls a branch ref mutable', () => {
  assert.deepEqual(refMutability(REAL), { ref: 'main', mutable: true });
});

test('refMutability calls a 40-char sha immutable', () => {
  const { ref, mutable } = refMutability(PINNED);
  assert.equal(ref.length, 40);
  assert.equal(mutable, false);
});

test('refMutability treats a 39-char hex ref as mutable', () => {
  const short = PINNED.replace(/[0-9a-f]{40}/, 'a'.repeat(39));
  assert.equal(refMutability(short).mutable, true, 'anchored length check must reject 39');
});

test('refMutability treats a branch named like a sha prefix as mutable', () => {
  const branchy = PINNED.replace(/[0-9a-f]{40}/, `backup-${'a'.repeat(40)}`);
  assert.equal(
    refMutability(branchy).mutable,
    true,
    'an unanchored test would read this as a commit',
  );
});

test('refMutability fails safe when there is no URL', () => {
  assert.deepEqual(refMutability(null), { ref: null, mutable: true });
});

test('contextLines names the version, the pin and the index', () => {
  const out = contextLines({ version: '10', url: REAL, matches: 1, pin: 'v0.134.0' }).join('\n');
  assert.match(out, /checker: v10/);
  assert.match(out, /v0\.134\.0/);
  assert.match(out, /principles\/index\.json/);
});

test('contextLines states the stale-index alternative the checker suppresses', () => {
  const out = contextLines({ version: '10', url: REAL, matches: 1, pin: 'v0.134.0' }).join('\n');
  assert.match(out, /stale index/i, 'the suppressed alternative must be named, not implied');
});

test('contextLines warns that a branch-read index moves', () => {
  const out = contextLines({ version: '10', url: REAL, matches: 1, pin: 'v0.134.0' }).join('\n');
  assert.match(out, /which moves/);
  assert.match(out, /"main"/);
});

test('contextLines drops the moves-warning once the index is pinned by sha', () => {
  const out = contextLines({ version: '10', url: PINNED, matches: 1, pin: 'v0.134.0' }).join('\n');
  assert.doesNotMatch(
    out,
    /which moves/,
    'a repo that fixed the problem must stop being told it has it',
  );
  assert.match(out, /principles\/index\.json/, 'the index is still reported');
});

test('contextLines reports the candidate count when the URL could not be determined', () => {
  const out = contextLines({ version: '10', url: null, matches: 3, pin: 'v0.134.0' }).join('\n');
  assert.match(out, /3 URL candidate\(s\)/);
  assert.match(out, /expected exactly 1/);
});

test('contextLines says so plainly when the version lookup failed', () => {
  const out = contextLines({ version: null, url: REAL, matches: 1, pin: 'v0.134.0' }).join('\n');
  assert.match(out, /vunknown/, 'a failed lookup must not be rendered as a real version');
});

test('contextLines says so plainly when no pin is recorded', () => {
  const out = contextLines({ version: '10', url: REAL, matches: 1, pin: null }).join('\n');
  assert.match(out, /unrecorded pin/);
});

test('contextLines always points at the control that measures staleness', () => {
  for (const pin of ['v0.134.0', null]) {
    for (const url of [REAL, PINNED, null]) {
      const out = contextLines({ version: '10', url, matches: 1, pin }).join('\n');
      assert.match(out, /eng:vendor:check/, `missing on pin=${pin} url=${url}`);
    }
  }
});
