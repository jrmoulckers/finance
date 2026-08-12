import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  enginesAdmitsAbove,
  exercisedMajorsAbove,
  findAdmittedIncompatibilities,
  findNodeVersionMismatches,
  findNodeVersionPins,
  findRangeExerciseViolations,
  majorSatisfiesEngines,
  parseNvmrc,
  pinMajor,
  probeVersions,
  RANGE_MARKER,
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

const marked = (version) =>
  `      - uses: actions/setup-node@abc\n        with:\n          node-version: '${version}' # ${RANGE_MARKER}\n`;

test('a marked literal is exempt from the .nvmrc equality rule', () => {
  assert.deepEqual(findNodeVersionMismatches('nightly.yml', marked('24'), '22'), []);
});

test('an unmarked literal of the same value is still a mismatch', () => {
  const text = marked('24').replace(` # ${RANGE_MARKER}`, '');
  assert.equal(findNodeVersionMismatches('nightly.yml', text, '22').length, 1);
});

test('findNodeVersionPins records the marker only when present', () => {
  assert.equal(findNodeVersionPins(marked('24'))[0].exercisesRange, true);
  const bare = marked('24').replace(` # ${RANGE_MARKER}`, '');
  assert.equal(findNodeVersionPins(bare)[0].exercisesRange, false);
});

test('majorSatisfiesEngines honours both bounds and stays undecided when unreadable', () => {
  assert.equal(majorSatisfiesEngines('24', '>=22.0.0'), true);
  assert.equal(majorSatisfiesEngines('20', '>=22.0.0'), false);
  assert.equal(majorSatisfiesEngines('26', '>=22.0.0 <25'), false);
  assert.equal(majorSatisfiesEngines('24', '>=22.0.0 <25'), true);
  assert.equal(majorSatisfiesEngines('24', 'lts/*'), null);
  assert.equal(majorSatisfiesEngines(null, '>=22.0.0'), null);
});

test('a marker on the .nvmrc major is fatal because it exercises nothing', () => {
  const found = findRangeExerciseViolations('nightly.yml', marked('22'), '22', '>=22.0.0');
  assert.equal(found.length, 1);
  assert.match(found[0], /exercises nothing/);
});

test('a marker outside the declared range is fatal', () => {
  const found = findRangeExerciseViolations('nightly.yml', marked('20'), '22', '>=22.0.0');
  assert.equal(found.length, 1);
  assert.match(found[0], /outside engines\.node/);
});

test('a marker on an unreadable version is fatal rather than silently exempt', () => {
  const found = findRangeExerciseViolations(
    'nightly.yml',
    marked('${{ matrix.node }}'),
    '22',
    '>=22.0.0',
  );
  assert.equal(found.length, 1);
  assert.match(found[0], /cannot be read/);
});

test('a valid marker produces no violation', () => {
  assert.deepEqual(findRangeExerciseViolations('nightly.yml', marked('24'), '22', '>=22.0.0'), []);
});

test('exercisedMajorsAbove reports marked majors above the declared one only', () => {
  const files = [
    { file: 'a.yml', text: marked('24') },
    { file: 'b.yml', text: marked('24').replace(` # ${RANGE_MARKER}`, '') },
  ];
  assert.deepEqual(exercisedMajorsAbove(files, '22'), ['24']);
  assert.deepEqual(exercisedMajorsAbove([{ file: 'c.yml', text: marked('22') }], '22'), []);
});

test('the repository declares a range and exercises it', () => {
  const engines = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')).engines;
  const expected = parseNvmrc(readFileSync(join(repositoryRoot, '.nvmrc'), 'utf8'));
  if (!enginesAdmitsAbove(engines.node, expected)) return;
  const files = readdirSync(workflowDirectory)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((file) => ({ file, text: readFileSync(join(workflowDirectory, file), 'utf8') }));
  assert.ok(
    exercisedMajorsAbove(files, expected).length > 0,
    'engines.node claims majors above .nvmrc but no workflow runs one',
  );
});

test('majorSatisfiesEngines reads every alternative, not the first bound it sees', () => {
  // The regression: reading the first `>=` and the first `<` out of
  // `>=22.23.0 <23 || >=24` took the ceiling from the wrong alternative and
  // rejected Node 24, which is the major the range exists to admit.
  const range = '>=22.23.0 <23 || >=24';
  assert.equal(majorSatisfiesEngines('24', range), true);
  assert.equal(majorSatisfiesEngines('22', range), true);
  assert.equal(majorSatisfiesEngines('23', range), false);
  assert.equal(majorSatisfiesEngines('20', range), false);
});

test('majorSatisfiesEngines stays undecided on a range it cannot parse', () => {
  assert.equal(majorSatisfiesEngines('22', 'lts/*'), null);
  assert.equal(majorSatisfiesEngines('22', ''), null);
  assert.equal(majorSatisfiesEngines(null, '>=22'), null);
});

test('enginesAdmitsAbove is not "has no upper bound"', () => {
  assert.equal(enginesAdmitsAbove('>=22.23.0 <23 || >=24', '22'), true);
  assert.equal(enginesAdmitsAbove('>=22.0.0 <23', '22'), false);
  assert.equal(enginesAdmitsAbove('>=22.0.0', '22'), true);
  assert.equal(enginesAdmitsAbove('lts/*', '22'), false);
});

test('probeVersions samples the bounds dependencies actually state', () => {
  const versions = probeVersions(['>=22.22.1', '^20.19.0 || ^22.13.0 || >=24']);
  // A fixed grid of major boundaries steps straight over 22.22.1, which is the
  // bound that makes the claim false.
  assert.ok(versions.includes('22.22.1'));
  assert.ok(versions.includes('20.19.0'));
  assert.ok(versions.includes('24.0.0'));
});

test('findAdmittedIncompatibilities names a version the range admits and a dependency rejects', () => {
  const admitted = findAdmittedIncompatibilities('>=22.0.0', [
    { name: 'a', range: '>=22.22.1' },
    { name: 'b', range: '>=22.0.0' },
  ]);
  assert.ok(admitted.length > 0);
  assert.equal(admitted[0].version, '22.0.0');
  assert.equal(admitted[0].count, 1);
  assert.deepEqual(admitted[0].ranges, ['>=22.22.1']);
});

test('findAdmittedIncompatibilities reports the lowest failing version first', () => {
  const admitted = findAdmittedIncompatibilities('>=20.0.0', [{ name: 'a', range: '>=24.0.0' }]);
  assert.equal(admitted[0].version, '20.0.0');
  assert.ok(admitted.every((entry, i) => i === 0 || entry.version >= admitted[0].version));
});

test('findAdmittedIncompatibilities is silent when the range is honest', () => {
  assert.deepEqual(
    findAdmittedIncompatibilities('>=22.23.0 <23 || >=24', [
      { name: 'a', range: '>=22.22.1' },
      { name: 'b', range: '^20.19.0 || ^22.13.0 || >=24' },
    ]),
    [],
  );
});

test('findAdmittedIncompatibilities ignores unreadable inputs rather than throwing', () => {
  assert.deepEqual(findAdmittedIncompatibilities('lts/*', [{ name: 'a', range: '>=24' }]), []);
  assert.deepEqual(findAdmittedIncompatibilities(undefined, [{ name: 'a', range: '>=24' }]), []);
  // A dependency whose range is unparseable cannot accuse the declaration.
  assert.deepEqual(
    findAdmittedIncompatibilities('>=22.0.0', [{ name: 'a', range: 'garbage' }]),
    [],
  );
});
test('findAdmittedIncompatibilities sorts by version, not by probe order', () => {
  // Probing walks the major grid first and appends dependency-stated bounds
  // after it, so an unsorted result reports 22.22.1 last -- below every version
  // printed before it. The caller shows admitted[0] as "the lowest that fails".
  const admitted = findAdmittedIncompatibilities('>=22.0.0', [
    { name: 'a', range: '>=22.22.1' },
    { name: 'b', range: '>=30.0.0' },
  ]);
  assert.equal(admitted[0].version, '22.0.0');
  assert.equal(admitted[1].version, '22.22.1');
});
