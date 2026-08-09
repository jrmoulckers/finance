import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractJob,
  findMutableReferenceViolations,
  findRunExpressionViolations,
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
