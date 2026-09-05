import assert from 'node:assert/strict';
import test from 'node:test';

import { compareNodeMajor, parseNodeMajor } from './node-runtime.mjs';

test('parseNodeMajor accepts bare, prefixed, and full versions', () => {
  assert.equal(parseNodeMajor('22\n'), 22);
  assert.equal(parseNodeMajor('v22.23.0'), 22);
  assert.equal(parseNodeMajor('24.3.0'), 24);
});

test('compareNodeMajor is silent when the runtime matches .nvmrc', () => {
  assert.deepEqual(compareNodeMajor('22\n', '22.23.0'), {
    ok: true,
    expectedMajor: 22,
    runtimeMajor: 22,
    message: '',
  });
});

test('compareNodeMajor explains how to fix a mismatching runtime', () => {
  const result = compareNodeMajor('22\n', '24.3.0');

  assert.equal(result.ok, false);
  assert.equal(result.expectedMajor, 22);
  assert.equal(result.runtimeMajor, 24);
  assert.match(result.message, /Node 24\.3\.0 does not match \.nvmrc \(22\)/);
  assert.match(result.message, /Lockfiles generated here may be rejected by CI/);
  assert.match(result.message, /nvm use/);
});

test('compareNodeMajor fails closed when either version is unreadable', () => {
  assert.match(compareNodeMajor('lts/*', '22.23.0').message, /Could not read.*\.nvmrc/);
  assert.match(compareNodeMajor('22', 'unknown').message, /Could not read the running Node/);
});
