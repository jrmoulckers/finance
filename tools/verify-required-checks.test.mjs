// SPDX-License-Identifier: BUSL-1.1
//
// Unit tests for tools/verify-required-checks.mjs
// Run with: node --test tools/verify-required-checks.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyGatekeeper, selectLatestCheckRun } from './verify-required-checks.mjs';

test('selectLatestCheckRun picks the newest matching run by started_at', () => {
  const runs = [
    {
      id: 1,
      name: 'Required Checks Gatekeeper',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-07-18T10:00:00Z',
    },
    {
      id: 2,
      name: 'Required Checks Gatekeeper',
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-07-18T11:00:00Z',
    },
    {
      id: 3,
      name: 'Other Check',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-07-18T12:00:00Z',
    },
  ];
  assert.equal(selectLatestCheckRun(runs, 'Required Checks Gatekeeper').id, 2);
});

test('selectLatestCheckRun returns null when nothing matches', () => {
  assert.equal(selectLatestCheckRun([{ id: 1, name: 'A' }], 'Missing'), null);
  assert.equal(selectLatestCheckRun([], 'A'), null);
  assert.equal(selectLatestCheckRun(undefined, 'A'), null);
});

test('classifyGatekeeper treats a missing run as missing (keep waiting)', () => {
  assert.equal(classifyGatekeeper(null).decision, 'missing');
});

test('classifyGatekeeper treats queued/in_progress as pending (keep waiting)', () => {
  assert.equal(classifyGatekeeper({ status: 'queued', conclusion: null }).decision, 'pending');
  assert.equal(classifyGatekeeper({ status: 'in_progress', conclusion: null }).decision, 'pending');
});

test('classifyGatekeeper passes on completed + allowed conclusion', () => {
  assert.equal(classifyGatekeeper({ status: 'completed', conclusion: 'success' }).decision, 'pass');
  assert.equal(classifyGatekeeper({ status: 'completed', conclusion: 'skipped' }).decision, 'pass');
});

test('classifyGatekeeper fails on completed + disallowed conclusion', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'neutral']) {
    assert.equal(
      classifyGatekeeper({ status: 'completed', conclusion }).decision,
      'fail',
      conclusion,
    );
  }
});

test('classifyGatekeeper honours a custom allow-list', () => {
  assert.equal(
    classifyGatekeeper({ status: 'completed', conclusion: 'skipped' }, ['success']).decision,
    'fail',
  );
  assert.equal(
    classifyGatekeeper({ status: 'completed', conclusion: 'success' }, ['success']).decision,
    'pass',
  );
});
