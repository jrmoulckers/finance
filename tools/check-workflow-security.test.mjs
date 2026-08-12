import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractJob,
  findInheritingJobs,
  findMutableReferenceViolations,
  findRunExpressionViolations,
  scanWorkflowSecurity,
} from './check-workflow-security.mjs';

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
