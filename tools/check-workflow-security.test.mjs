import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  deadEventConjunct,
  extractJob,
  findDeadEventGuards,
  findInheritingJobs,
  findMutableReferenceViolations,
  findRunExpressionViolations,
  normalizeReviewedPins,
  pureEventDisjunction,
  NAMED_WORKFLOW_ASSERTIONS,
  scanWorkflowSecurity,
  summarizeScope,
} from './check-workflow-security.mjs';

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowDirectory = join(testRoot, '.github', 'workflows');
const productionCompose = readFileSync(join(testRoot, 'deploy', 'docker-compose.yml'), 'utf8');

test('findDeadEventGuards decides conjunctions that a pure disjunction cannot', () => {
  const workflow = `
on:
  push:
  workflow_dispatch:
jobs:
  report:
    if: \${{ always() && github.event_name == 'pull_request' && needs.build.outputs.ok == 'true' }}
    steps:
      - run: echo hi
`;

  const violations = findDeadEventGuards('ci-web.yml', workflow);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /requires event 'pull_request'/);
});

test('deadEventConjunct ignores an undeclared event inside a parenthesised disjunction', () => {
  // '(a || b) && c' is satisfiable via b even when a is unreachable, so this
  // is not decidable by conjunct analysis and must not be reported.
  const expression =
    "(github.event_name == 'schedule' || github.event_name == 'push') && needs.x.outputs.y";
  assert.equal(deadEventConjunct(expression, ['push']), null);
  // A bare top-level conjunct naming an undeclared event is decidable.
  assert.equal(
    deadEventConjunct("github.event_name == 'schedule' && needs.x", ['push']),
    'schedule',
  );
  // Negation is never decided.
  assert.equal(deadEventConjunct("github.event_name != 'schedule' && needs.x", ['push']), null);
});

test('findDeadEventGuards flags a guard no declared trigger can satisfy', () => {
  const workflow = `
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 3 * * *'
jobs:
  dependency-review:
    if: github.event_name == 'pull_request'
    steps:
      - run: echo hi
`;

  const violations = findDeadEventGuards('ci-security.yml', workflow);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /job 'dependency-review'/);
  assert.match(violations[0], /can never run/);
});

test('findDeadEventGuards accepts a guard one declared trigger satisfies', () => {
  const workflow = `
on:
  push:
  pull_request:
jobs:
  dependency-review:
    if: github.event_name == 'pull_request'
    steps:
      - if: github.event_name == 'push' || github.event_name == 'schedule'
        run: echo hi
`;

  // The job guard is live. The step guard names 'schedule', which is not
  // declared, but 'push' is — a disjunction needs only one reachable term.
  assert.deepEqual(findDeadEventGuards('ci.yml', workflow), []);
});

test('findDeadEventGuards exempts reusable workflows, where event_name is the caller\u2019s', () => {
  const workflow = `
on:
  workflow_call:
jobs:
  detect:
    steps:
      - if: github.event_name == 'pull_request'
        run: echo hi
`;

  assert.deepEqual(findDeadEventGuards('reusable-detect-changes.yml', workflow), []);
});

test('pureEventDisjunction decides only plain disjunctions', () => {
  assert.deepEqual(pureEventDisjunction("github.event_name == 'push'"), ['push']);
  assert.deepEqual(
    pureEventDisjunction("${{ github.event_name == 'push' || github.event_name == 'schedule' }}"),
    ['push', 'schedule'],
  );
  // Undecidable from the trigger list alone, so not decided at all.
  assert.equal(
    pureEventDisjunction("github.event_name == 'push' && needs.changes.outputs.web"),
    null,
  );
  assert.equal(pureEventDisjunction("always() && github.event_name == 'push'"), null);
  assert.equal(pureEventDisjunction("github.event_name != 'pull_request'"), null);
  assert.equal(pureEventDisjunction(undefined), null);
});

test('findRunExpressionViolations finds direct input-to-shell interpolation', () => {
  const workflow = `
jobs:
  deploy:
    steps:
      - env:
          VERSION: \${{ inputs.version }}
        run: |
          echo "$VERSION"
      - run: echo "\${{ github.event.inputs.reason }}"
`;

  assert.deepEqual(findRunExpressionViolations(workflow), [9]);
});

test('findMutableReferenceViolations accepts SHAs and rejects mutable actions and tools', () => {
  const workflow = `
- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
- uses: actions/attest-build-provenance@v4
- run: npm install --global vercel@latest
`;

  assert.equal(findMutableReferenceViolations(workflow).length, 2);
});

test('extractJob returns only the requested top-level job', () => {
  const workflow = `
jobs:
  build:
    permissions: {}
  deploy:
    environment: production
`;

  assert.match(extractJob(workflow, 'build'), /permissions/);
  assert.doesNotMatch(extractJob(workflow, 'build'), /environment/);
});

test('findInheritingJobs reports only jobs that omit their own permissions', () => {
  const workflow = [
    'permissions:',
    '  contents: read',
    '  issues: write',
    'jobs:',
    '  declares:',
    '    permissions:',
    '      contents: read',
    '    runs-on: ubuntu-latest',
    '  inherits:',
    '    runs-on: ubuntu-latest',
    '',
  ].join('\n');

  assert.deepEqual(findInheritingJobs(workflow).jobs, ['inherits']);
});

test('findInheritingJobs treats an empty workflow-level grant as already fail-closed', () => {
  const workflow = ['permissions: {}', 'jobs:', '  bare:', '    runs-on: ubuntu-latest', ''].join(
    '\n',
  );

  const result = findInheritingJobs(workflow);
  assert.equal(result.base, '{}');
  assert.deepEqual(result.jobs, []);
});

test('scanWorkflowSecurity flags a new job that inherits a non-empty grant', () => {
  const workflow = [
    'permissions:',
    '  contents: read',
    'jobs:',
    '  unbaselined:',
    '    runs-on: ubuntu-latest',
    '',
  ].join('\n');

  const errors = scanWorkflowSecurity({ 'zz-not-baselined.yml': workflow });
  assert.equal(
    errors.some((error) => /zz-not-baselined\.yml: job unbaselined omits permissions:/.test(error)),
    true,
  );
});

test('scanWorkflowSecurity does not flag jobs recorded in the inheritance baseline', () => {
  const workflow = [
    'permissions:',
    '  contents: read',
    'jobs:',
    '  reversals:',
    '    runs-on: ubuntu-latest',
    '',
  ].join('\n');

  const errors = scanWorkflowSecurity({ 'migration-reversal-check.yml': workflow });
  assert.equal(
    errors.some((error) => /omits permissions:/.test(error)),
    false,
  );
});

test('normalizeReviewedPins elides a pinned reference and its version comment', () => {
  const before = '      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2';
  const after = '      - uses: actions/checkout@50b1a1e0dc63b1bbecac6b0c8a1a1e3a30e6f4b1 # v5.0.0';
  assert.equal(normalizeReviewedPins(before), normalizeReviewedPins(after));
  assert.equal(normalizeReviewedPins(before), '      - uses: actions/checkout@<PINNED>');
});

test('normalizeReviewedPins preserves owner/repo so repointing an action still drifts', () => {
  const genuine =
    '      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2';
  const swapped =
    '      - uses: attacker/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2';
  assert.notEqual(normalizeReviewedPins(genuine), normalizeReviewedPins(swapped));
});

test('normalizeReviewedPins leaves unpinned references intact so they still drift', () => {
  const tagged = '      - uses: actions/checkout@v4';
  assert.equal(normalizeReviewedPins(tagged), tagged);
  assert.equal(
    findMutableReferenceViolations(`${tagged}\n`).some((violation) =>
      /not pinned by full SHA/.test(violation.reason),
    ),
    true,
  );
});

test('normalizeReviewedPins does not elide a non-uses line that contains a SHA', () => {
  const line = '      run: echo 11bd71901bbe5b1630ceea73d27597364c9af683';
  assert.equal(normalizeReviewedPins(line), line);
});

// The reviewed-baseline hash and the 40-hex pin requirement both react to a `uses:` line,
// so redundancy is the null hypothesis and PR #4214's "still covered by the pin check"
// claim needs an input table, not an assertion. These three tests pin an input that
// separates the pair in each direction: C and E defeat the pin check, F defeats the
// baseline. A guard pair with no separating input is one guard read twice.
//
// Both reviewed files must appear in every map: an absent one reads as '' and drifts,
// which silently fires the baseline on every row including the control.
const reviewedWorkflows = () => ({
  'reusable-detect-changes.yml': readFileSync(
    new URL('../.github/workflows/reusable-detect-changes.yml', import.meta.url),
    'utf8',
  ),
  'reusable-release-smoke-test.yml': readFileSync(
    new URL('../.github/workflows/reusable-release-smoke-test.yml', import.meta.url),
    'utf8',
  ),
});
const drifted = (errors) => errors.some((error) => /reviewed local reusable drifted/.test(error));
const unpinned = (errors) => errors.some((error) => /not pinned by full SHA/.test(error));

test('control: the reviewed workflows as committed trip neither guard', () => {
  const errors = scanWorkflowSecurity(reviewedWorkflows());
  assert.equal(drifted(errors), false);
  assert.equal(unpinned(errors), false);
});

test('repointing a pinned action to another owner is caught by the baseline alone', () => {
  const workflows = reviewedWorkflows();
  const before = workflows['reusable-detect-changes.yml'];
  const after = before.replace(/uses: dorny\//, 'uses: attacker/');
  assert.notEqual(after, before, 'expected a pinned reference to mutate');
  workflows['reusable-detect-changes.yml'] = after;

  const errors = scanWorkflowSecurity(workflows);
  assert.equal(drifted(errors), true);
  assert.equal(unpinned(errors), false, 'still a full SHA, so the pin check is silent');
});

test('a structural edit touching no uses: line is caught by the baseline alone', () => {
  const workflows = reviewedWorkflows();
  workflows['reusable-detect-changes.yml'] += '      - run: echo pwned\n';

  const errors = scanWorkflowSecurity(workflows);
  assert.equal(drifted(errors), true);
  assert.equal(unpinned(errors), false);
});

test('an unpinned action outside the reviewed set is caught by the pin check alone', () => {
  const workflows = reviewedWorkflows();
  workflows['unreviewed.yml'] = [
    'name: Unreviewed',
    'on: push',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '',
  ].join('\n');

  const errors = scanWorkflowSecurity(workflows);
  assert.equal(unpinned(errors), true);
  assert.equal(drifted(errors), false, 'the baseline has no jurisdiction outside its 2 files');
});

// --- The population a clean run is clean over -------------------------------
//
// These pin a property that was inferred backwards. Reading the six `?? ''`
// fallbacks suggested that a renamed or deleted workflow would silently pass,
// because an absent file becomes an empty string. Running it showed the
// opposite: every named-file assertion is positive, so an absent file FAILS it.
// The tests exist because reading gave the wrong answer and nothing in the
// suite would have caught the reader.

const workflowsOnDisk = () =>
  Object.fromEntries(
    readdirSync(workflowDirectory)
      .filter((file) => /\.ya?ml$/.test(file))
      .sort()
      .map((file) => [file, readFileSync(join(workflowDirectory, file), 'utf8')]),
  );

test('an empty workflow set fails closed rather than passing vacuously', () => {
  // The single most important property of this checker: a green must not be
  // obtainable by giving it nothing to read.
  assert.ok(scanWorkflowSecurity({}, '').length > 0);
});

test('removing a named-assertion workflow raises errors rather than retiring checks', () => {
  const full = workflowsOnDisk();
  assert.equal(scanWorkflowSecurity(full, productionCompose).length, 0);
  for (const victim of ['deploy-preview.yml', 'nightly.yml', 'deploy-production.yml']) {
    const reduced = { ...full };
    delete reduced[victim];
    assert.ok(
      scanWorkflowSecurity(reduced, productionCompose).length > 0,
      `removing ${victim} must not be a silent pass`,
    );
  }
});

test('every named assertion target is present on disk', () => {
  // A named target that no longer exists is an assertion whose subject left.
  const present = workflowsOnDisk();
  const absent = [...NAMED_WORKFLOW_ASSERTIONS].filter((file) => !(file in present));
  assert.deepEqual(absent, []);
});

test('the reported scope is arithmetic over the real tree, not a constant', () => {
  const disk = workflowsOnDisk();
  const scope = summarizeScope(disk);
  assert.equal(scope.loaded, Object.keys(disk).length);
  assert.equal(scope.present, scope.named);
  assert.ok(scope.loaded >= scope.present);
});

test('the named denominator is pinned to the tree, not to itself', () => {
  // An earlier version asserted `scope.named === NAMED_WORKFLOW_ASSERTIONS.size`,
  // which compares the set to itself and is therefore decorative: two mutants
  // that shrank the set survived it. Pinning the COMPLEMENT against the disk is
  // what makes the denominator falsifiable — drop an entry from the named set
  // and this list grows.
  const disk = Object.keys(workflowsOnDisk());
  const universalOnly = disk.filter((file) => !NAMED_WORKFLOW_ASSERTIONS.has(file));
  assert.deepEqual(universalOnly, ['copilot-setup-steps.yml']);
});

test('summarizeScope counts what it is given, not what is on disk', () => {
  assert.deepEqual(summarizeScope({}), {
    loaded: 0,
    named: NAMED_WORKFLOW_ASSERTIONS.size,
    present: 0,
  });
});

// -- scope on the failure path ---------------------------------------------
// summarizeScope() was added to answer "the population is never in the
// output", then called AFTER the failure return -- so the remedy reproduced
// the defect on the branch where the denominator matters more. "3 errors" over
// 31 workflows is a different claim from "3 errors" over 3.

const SECURITY_TOOL = resolve(testRoot, 'tools', 'check-workflow-security.mjs');

test('a passing run states the scope', () => {
  const result = spawnSync(process.execPath, [SECURITY_TOOL], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\d+ workflow\(s\) scanned in /);
  assert.match(result.stdout, /\d+ of \d+ named assertion target\(s\) present/);
  assert.match(result.stdout, /\d+ covered by the universal checks only/);
});

test('the failure branch emits the scope before returning', () => {
  // Pinned by source rather than by running a mutated tree, because forcing a
  // real failure would mean writing a broken workflow into .github/workflows.
  // Stated as the narrowing it is: this asserts the ordering, not the text.
  const source = readFileSync(SECURITY_TOOL, 'utf8');
  const scopeAssigned = source.indexOf('const scope = summarizeScope(workflows);');
  const failureBranch = source.indexOf('if (errors.length > 0) {');
  const scopeOnFailure = source.indexOf('console.error(`Scope: ${scopeLine}`);');
  assert.ok(scopeAssigned > -1 && failureBranch > -1 && scopeOnFailure > -1);
  assert.ok(scopeAssigned < failureBranch, 'scope must be computed before the branch');
  assert.ok(
    scopeOnFailure > failureBranch && scopeOnFailure < source.indexOf('process.exitCode = 1;'),
    'the failure branch must print the scope before it sets the exit code',
  );
});
