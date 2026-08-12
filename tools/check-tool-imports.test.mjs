import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  bareSpecifier,
  declaredDependencies,
  findModuleReferences,
  findUndeclaredReferences,
  isScannedFile,
  SCANNED_DIRECTORIES,
} from './check-tool-imports.mjs';

const declared = new Set(['js-yaml', 'semver']);

test('bareSpecifier keeps both segments of a scoped package', () => {
  assert.equal(bareSpecifier('@commitlint/cli'), '@commitlint/cli');
  assert.equal(bareSpecifier('@commitlint/cli/lib/thing.js'), '@commitlint/cli');
});

test('bareSpecifier keeps one segment of an unscoped package', () => {
  assert.equal(bareSpecifier('js-yaml'), 'js-yaml');
  assert.equal(bareSpecifier('js-yaml/dist/js-yaml.mjs'), 'js-yaml');
});

test('bareSpecifier declines paths and builtin protocol specifiers', () => {
  assert.equal(bareSpecifier('./local.mjs'), null);
  assert.equal(bareSpecifier('../sibling/local.mjs'), null);
  assert.equal(bareSpecifier('/abs/path.mjs'), null);
  assert.equal(bareSpecifier('node:fs'), null);
});

test('bareSpecifier declines a computed specifier rather than guessing', () => {
  assert.equal(bareSpecifier('${dir}/thing.mjs'), null);
  assert.equal(bareSpecifier(''), null);
  assert.equal(bareSpecifier(undefined), null);
});

test('findModuleReferences reads every static form', () => {
  const source = [
    "import { load } from 'js-yaml';",
    "import 'side-effect-pkg';",
    "export { thing } from 'export-from-pkg';",
    "const mod = await import('dynamic-pkg');",
    "const cjs = require('require-pkg');",
  ].join('\n');
  assert.deepEqual(
    findModuleReferences(source).map((reference) => reference.specifier),
    ['js-yaml', 'side-effect-pkg', 'export-from-pkg', 'dynamic-pkg', 'require-pkg'],
  );
});

test('findModuleReferences reports the line each reference sits on', () => {
  const source = ["import a from 'alpha';", '', "import b from 'beta';"].join('\n');
  assert.deepEqual(
    findModuleReferences(source).map((reference) => [reference.specifier, reference.line]),
    [
      ['alpha', 1],
      ['beta', 3],
    ],
  );
});

test('findModuleReferences skips a computed dynamic import', () => {
  const source = 'const mod = await import(pathToFileURL(resolved).href);';
  assert.deepEqual(findModuleReferences(source), []);
});

test('findUndeclaredReferences reports an undeclared package once per line', () => {
  const source = "import { load } from 'js-yaml';\nimport x from 'ghost-pkg';";
  const violations = findUndeclaredReferences('tools/a.mjs', source, declared);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /tools\/a\.mjs:2 imports "ghost-pkg"/);
});

test('findUndeclaredReferences reports each line, so every call site is named', () => {
  const source = "import a from 'ghost-pkg';\nconst b = require('ghost-pkg');";
  const violations = findUndeclaredReferences('tools/a.mjs', source, declared);
  assert.equal(violations.length, 2);
  assert.match(violations[0], /tools\/a\.mjs:1 /);
  assert.match(violations[1], /tools\/a\.mjs:2 /);
});
test('findUndeclaredReferences accepts a subpath of a declared package', () => {
  const source = "import { load } from 'js-yaml/dist/js-yaml.mjs';";
  assert.deepEqual(findUndeclaredReferences('tools/a.mjs', source, declared), []);
});

test('findUndeclaredReferences accepts node builtins without a declaration', () => {
  const source = "import { readFileSync } from 'node:fs';\nimport path from 'path';";
  assert.deepEqual(findUndeclaredReferences('tools/a.mjs', source, declared), []);
});

test('findUndeclaredReferences reports a scoped package by its full name', () => {
  const source = "import x from '@ghost/scope/sub';";
  const violations = findUndeclaredReferences('tools/a.mjs', source, declared);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /imports "@ghost\/scope"/);
});

test('declaredDependencies unions both dependency groups', () => {
  const set = declaredDependencies({
    dependencies: { alpha: '^1.0.0' },
    devDependencies: { beta: '^2.0.0' },
  });
  assert.deepEqual([...set].sort(), ['alpha', 'beta']);
});

test('declaredDependencies tolerates a manifest with neither group', () => {
  assert.equal(declaredDependencies({}).size, 0);
  assert.equal(declaredDependencies(undefined).size, 0);
});

test('the scanned directories are the ones whose scripts run from the root', () => {
  assert.deepEqual(SCANNED_DIRECTORIES, ['tools', 'scripts']);
});

test('isScannedFile excludes test files, whose imports are fixtures', () => {
  assert.equal(isScannedFile('check-tool-imports.mjs'), true);
  assert.equal(isScannedFile('check-tool-imports.test.mjs'), false);
  assert.equal(isScannedFile('thing.test.js'), false);
  assert.equal(isScannedFile('thing.test.cjs'), false);
});

test('isScannedFile matches the extension, not a substring of the name', () => {
  assert.equal(isScannedFile('latest.mjs'), true);
  assert.equal(isScannedFile('protest.js'), true);
});

test('isScannedFile declines a file that is not a module', () => {
  assert.equal(isScannedFile('README.md'), false);
  assert.equal(isScannedFile('config.json'), false);
  assert.equal(isScannedFile(undefined), false);
});

// -- scope on the failure path ---------------------------------------------
// The scope line used to print only on success, so a failure named a count
// over an unstated denominator. 1 of 45 files with 8 excluded is a different
// claim from 1 of 3.

const toolDirectory = dirname(fileURLToPath(import.meta.url));
const TOOL = join(toolDirectory, 'check-tool-imports.mjs');

function runWithProbe(source) {
  const probe = join(toolDirectory, '_scope_probe_fixture.mjs');
  writeFileSync(probe, source, 'utf8');
  try {
    return spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  } finally {
    unlinkSync(probe);
  }
}

test('a failing run states the scope it failed over', () => {
  const result = runWithProbe("import q from 'no-such-package-scope-probe';\nexport default q;\n");
  assert.equal(result.status, 1, 'the probe must actually fail, or this asserts nothing');
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /Scope: \d+ module reference\(s\) across \d+ file\(s\)/);
  // The excluded bucket is the one that must never look like a scope bug: a
  // test for an import checker cannot avoid containing imports as data, so the
  // exclusion is structural and permanent.
  assert.match(output, /\d+ test file\(s\) excluded/);
});

test('a passing run states the same scope, so the two branches agree', () => {
  const result = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\d+ module reference\(s\) across \d+ file\(s\)/);
  assert.match(result.stdout, /\d+ test file\(s\) excluded/);
});
