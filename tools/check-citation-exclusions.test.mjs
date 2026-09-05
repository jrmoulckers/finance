import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseCitationExclusions,
  undeclaredCitationExclusions,
} from './check-citation-exclusions.mjs';

test('parses checker exclusions across Windows and POSIX paths', () => {
  const pragma = ['citations-check', ': ignore-file'].join('');
  const output =
    'citation check passed\n' + `2 file(s) skipped via "${pragma}": docs\\one.md, docs/two.md\n`;

  assert.deepEqual(parseCitationExclusions(output), ['docs/one.md', 'docs/two.md']);
});

test('returns no exclusions when the checker skipped no files', () => {
  assert.deepEqual(parseCitationExclusions('208 citation(s) checked\n'), []);
});

test('rejects a changed skip-line format instead of silently passing', () => {
  assert.throws(
    () => parseCitationExclusions('1 file skipped via a pragma: docs/hidden.md\n'),
    /unrecognized format/,
  );
});

test('requires every excluded path to have a non-empty reason', () => {
  const exclusions = ['docs/declared.md', 'docs/blank.md', 'docs/missing.md'];
  const declarations = {
    'docs/declared.md': 'Historical fixture intentionally contains invalid citations.',
    'docs/blank.md': ' ',
  };

  assert.deepEqual(undeclaredCitationExclusions(exclusions, declarations), [
    'docs/blank.md',
    'docs/missing.md',
  ]);
});
