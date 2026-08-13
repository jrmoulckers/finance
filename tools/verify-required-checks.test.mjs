// SPDX-License-Identifier: BUSL-1.1
//
// Unit tests for tools/verify-required-checks.mjs
// Run with: node --test tools/verify-required-checks.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyGatekeeper,
  decisionLine,
  selectLatestCheckRun,
  startupLines,
  timeoutLine,
  waitingLine,
} from './verify-required-checks.mjs';

// Report-line tests (#4303).
//
// A sentinel mutation sweep found 0 of this tool's 35 interpolation sites asserted. The cause was
// structural: every sentence was inline in an async polling loop that reaches the network, so no
// test could reach them. The tests below read the interpolated *values*, not just a static label
// -- an assertion that only checks the emoji or the word "Timed out" survives any mutation of the
// SHA, check name, or conclusion, which are the three things a deploy-gate report exists to state.

const CONFIG = {
  checkName: 'Required Checks Gatekeeper',
  repo: 'jrmoulckers/finance',
  sha: '3cac6b52aaaabbbbccccddddeeeeffff00001111',
  allowed: ['success', 'skipped'],
  timeoutSeconds: 1800,
  intervalSeconds: 20,
};

test('startupLines names the check, repo, short SHA, allowed conclusions and both budgets', () => {
  const lines = startupLines(CONFIG);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /"Required Checks Gatekeeper"/);
  assert.match(lines[0], /jrmoulckers\/finance@3cac6b52aaaa$/);
  assert.equal(lines[1], 'Allowed conclusions: success, skipped');
  assert.equal(lines[2], 'Wait budget: 1800s, poll interval: 20s');
});

test('startupLines truncates the SHA to 12 characters, not the full 40', () => {
  const [first] = startupLines(CONFIG);
  assert.ok(first.includes('3cac6b52aaaa'), first);
  assert.ok(!first.includes(CONFIG.sha), 'full SHA must not be printed');
});

test('decisionLine reports the conclusion that caused a pass', () => {
  const line = decisionLine('pass', { ...CONFIG, conclusion: 'skipped' });
  assert.match(line, /^✅/);
  assert.match(line, /conclusion "skipped"/);
  assert.match(line, /gate passed\.$/);
});

test('decisionLine names the disallowed conclusion and the SHA it refuses', () => {
  const line = decisionLine('fail', { ...CONFIG, conclusion: 'failure' });
  assert.match(line, /^❌/);
  assert.match(line, /disallowed conclusion "failure"/);
  assert.match(line, /refusing to deploy 3cac6b52aaaa\.$/);
});

test('waitingLine for a missing gatekeeper reports the check-run count seen so far', () => {
  const line = waitingLine({
    decision: 'missing',
    checkName: CONFIG.checkName,
    status: null,
    conclusion: null,
    total: 7,
    intervalSeconds: 20,
    remainingSeconds: 940,
  });
  assert.match(line, /not created yet/);
  assert.match(line, /\b7 check-run\(s\) on SHA so far/);
  assert.match(line, /Retrying in 20s \(940s left\)\.$/);
});

test('waitingLine for a pending gatekeeper reports its status and omits a null conclusion', () => {
  const line = waitingLine({
    decision: 'pending',
    checkName: CONFIG.checkName,
    status: 'in_progress',
    conclusion: null,
    total: 7,
    intervalSeconds: 20,
    remainingSeconds: 940,
  });
  assert.match(line, /is in_progress — waiting for completion/);
  assert.ok(!line.includes('()'), 'a null conclusion must not render empty parentheses');
});

test('waitingLine renders a non-null conclusion in parentheses after the status', () => {
  const line = waitingLine({
    decision: 'pending',
    checkName: CONFIG.checkName,
    status: 'completed',
    conclusion: 'neutral',
    total: 7,
    intervalSeconds: 20,
    remainingSeconds: 940,
  });
  assert.match(line, /is completed \(neutral\) — waiting/);
});

test('timeoutLine distinguishes never-found-with-other-checks from no-checks-at-all', () => {
  const withOthers = timeoutLine({
    ...CONFIG,
    everSawGatekeeper: false,
    sawAnyCheckRuns: true,
  });
  const withNone = timeoutLine({
    ...CONFIG,
    everSawGatekeeper: false,
    sawAnyCheckRuns: false,
  });
  assert.match(withOthers, /did ci-security\.yml execute/);
  assert.match(withNone, /No check-runs were found at all/);
  assert.notEqual(withOthers, withNone);
  for (const line of [withOthers, withNone]) {
    assert.match(line, /Timed out after 1800s/);
    assert.match(line, /never found on 3cac6b52aaaa/);
  }
});

test('timeoutLine reports found-but-incomplete separately from never-found', () => {
  const line = timeoutLine({ ...CONFIG, everSawGatekeeper: true, sawAnyCheckRuns: true });
  assert.match(line, /was found but never completed on 3cac6b52aaaa/);
  assert.match(line, /Refusing to deploy an ungated commit\.$/);
  assert.ok(!line.includes('never found'), 'must not claim the gatekeeper was never found');
});

test('every terminal line is a refusal, so none may be mistaken for a pass', () => {
  const lines = [
    decisionLine('fail', { ...CONFIG, conclusion: 'failure' }),
    timeoutLine({ ...CONFIG, everSawGatekeeper: true, sawAnyCheckRuns: true }),
    timeoutLine({ ...CONFIG, everSawGatekeeper: false, sawAnyCheckRuns: false }),
  ];
  for (const line of lines) assert.match(line, /^❌/, line);
});

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
