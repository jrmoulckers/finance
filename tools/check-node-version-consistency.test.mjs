import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  enginesAdmitsAbove,
  findNodeVersionMismatches,
  findNodeVersionPins,
  parseNvmrc,
  pinMajor,
} from './check-node-version-consistency.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowDirectory = join(repositoryRoot, '.github', 'workflows');

test('parseNvmrc reads a bare major and a v-prefixed one', () => {
  assert.equal(parseNvmrc('22\n'), '22');
  assert.equal(parseNvmrc('v20'), '20');
  assert.equal(parseNvmrc(''), null);
});

test('pinMajor reads the major from a full version', () => {
  assert.equal(pinMajor('22.11.0'), '22');
  assert.equal(pinMajor('lts/*'), null);
});

test('findNodeVersionPins ignores a commented-out example', () => {
  const pins = findNodeVersionPins(
    ['      # node-version: 18', '      node-version: 22'].join('\n'),
  );
  assert.equal(pins.length, 1);
  assert.equal(pins[0].value, '22');
});

test('findNodeVersionPins separates a literal from a node-version-file pin', () => {
  const pins = findNodeVersionPins(
    ['      node-version: 22', '      node-version-file: .nvmrc'].join('\n'),
  );
  assert.deepEqual(
    pins.map((pin) => pin.kind),
    ['literal', 'file'],
  );
});

test('findNodeVersionMismatches flags a literal that disagrees with .nvmrc', () => {
  const violations = findNodeVersionMismatches('ci.yml', '      node-version: 20', '22');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /ci\.yml:1 pins Node 20 but \.nvmrc declares 22/);
});

test('findNodeVersionMismatches accepts a literal that agrees', () => {
  assert.deepEqual(findNodeVersionMismatches('ci.yml', '      node-version: 22.11.0', '22'), []);
});

test('findNodeVersionMismatches never flags a node-version-file pin', () => {
  assert.deepEqual(
    findNodeVersionMismatches('ci.yml', '      node-version-file: .nvmrc', '22'),
    [],
  );
});

test('a node-version-file pin is exempt by kind, not by an unparsable path', () => {
  // `.nvmrc` exercises the kind guard and the unparsed-literal guard at once,
  // so it cannot tell them apart: deleting either leaves it passing. A path
  // whose first character is a digit parses as a major and separates them.
  assert.deepEqual(
    findNodeVersionMismatches('ci.yml', '      node-version-file: 20/.nvmrc', '22'),
    [],
  );
});

test('findNodeVersionMismatches leaves an unparsed literal undecided', () => {
  assert.deepEqual(findNodeVersionMismatches('ci.yml', '      node-version: lts/*', '22'), []);
});

test('enginesAdmitsAbove separates an open lower bound from a closed range', () => {
  assert.equal(enginesAdmitsAbove('>=22.0.0', '22'), true);
  assert.equal(enginesAdmitsAbove('>=22.0.0 <23.0.0', '22'), false);
  assert.equal(enginesAdmitsAbove(undefined, '22'), false);
});

test('the pin predicate matches real workflow content, not just fixtures', () => {
  const literals = readdirSync(workflowDirectory)
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) => findNodeVersionPins(readFileSync(join(workflowDirectory, name), 'utf8')))
    .filter((pin) => pin.kind === 'literal');
  assert.ok(
    literals.length > 0,
    'a predicate that matches nothing in the tree would pass every other row here',
  );
});

test('the real workflow tree agrees with .nvmrc, and a mutated copy does not', () => {
  const expected = parseNvmrc(readFileSync(join(repositoryRoot, '.nvmrc'), 'utf8'));
  const files = readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/.test(name));
  const violations = files.flatMap((name) =>
    findNodeVersionMismatches(name, readFileSync(join(workflowDirectory, name), 'utf8'), expected),
  );
  assert.deepEqual(violations, []);

  const mutated = files
    .map((name) => readFileSync(join(workflowDirectory, name), 'utf8'))
    .find((text) => findNodeVersionPins(text).some((pin) => pin.kind === 'literal'))
    .replace(/node-version:\s*['"]?\d+/, 'node-version: 18');
  assert.ok(findNodeVersionMismatches('mutated.yml', mutated, expected).length > 0);
});
