import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  enginesAdmitsAbove,
  exercisedMajorsAbove,
  findAdmittedIncompatibilities,
  findExcludedCompatibilities,
  findNodeVersionMismatches,
  findNodeVersionPins,
  findRangeExerciseViolations,
  majorSatisfiesEngines,
  parseNvmrc,
  pinMajor,
  directionNotices,
  directionPopulations,
  probeVersions,
  RANGE_MARKER,
  UNREACHABLE_FUTURE_VERSION,
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

test('reports a version every dependency accepts but the range excludes', () => {
  // Mirrors the real tree: something rejects 23, so the only disagreement left
  // is the patch-level floor. Without that, 23.0.0 is also reported -- see below.
  const deps = [{ range: '>=22.22.1 <23 || >=24' }, { range: '>=20' }];
  const found = findExcludedCompatibilities('>=22.23.0 <23 || >=24', deps);
  assert.deepEqual(
    found.map((f) => f.version),
    ['22.22.1'],
  );
});

test('the excluded direction is invisible to the admitted direction', () => {
  // findAdmittedIncompatibilities opens with `if (!satisfies) continue`, so the
  // excluded version is discarded before anything is asked about it. This is
  // the asymmetry the second function exists to close, and asserting both on
  // the same input is what makes it a measurement rather than a claim.
  // Mirrors the real tree: something rejects 23, so the only disagreement left
  // is the patch-level floor. Without that, 23.0.0 is also reported -- see below.
  const deps = [{ range: '>=22.22.1 <23 || >=24' }, { range: '>=20' }];
  assert.equal(findAdmittedIncompatibilities('>=22.23.0 <23 || >=24', deps).length, 0);
  assert.equal(findExcludedCompatibilities('>=22.23.0 <23 || >=24', deps).length, 1);
});

test('a range that excludes nothing acceptable reports nothing', () => {
  // Mirrors the real tree: something rejects 23, so the only disagreement left
  // is the patch-level floor. Without that, 23.0.0 is also reported -- see below.
  const deps = [{ range: '>=22.22.1 <23 || >=24' }, { range: '>=20' }];
  assert.equal(findExcludedCompatibilities('>=22.22.1 <23 || >=24', deps).length, 0);
});

test('a version rejected by one dependency is not reported as excluded', () => {
  // Excluding a version some dependency rejects is correct, not a defect.
  const deps = [{ range: '>=22.22.1' }, { range: '>=24' }];
  assert.equal(findExcludedCompatibilities('>=24', deps).length, 0);
});

test('an unparseable declared range yields no excluded findings', () => {
  assert.deepEqual(findExcludedCompatibilities('not a range', [{ range: '>=20' }]), []);
});

test('no dependencies means nothing is claimed in either direction', () => {
  // Without a population, "every dependency accepts it" is vacuously true and
  // would report every probe version as wrongly excluded.
  assert.deepEqual(findExcludedCompatibilities('>=24', []), []);
});

test('excluded findings are sorted by version', () => {
  const deps = [{ range: '>=20.1.0 || >=22.5.0' }];
  const found = findExcludedCompatibilities('>=24', deps).map((f) => f.version);
  assert.deepEqual(
    found,
    [...found].sort((a, b) => (a < b ? -1 : 1)),
  );
});

test('a deliberately excluded odd major is reported when nothing rejects it', () => {
  // Not a false positive, and worth pinning rather than suppressing. Odd Node
  // majors never reach LTS, so excluding one is usually intentional -- but the
  // function measures "every dependency accepts this", not "you should support
  // it". Encoding the behaviour here keeps the notice readable as a fact.
  const permissive = [{ range: '>=20' }];
  const found = findExcludedCompatibilities('>=22.22.1 <23 || >=24', permissive);
  assert.ok(found.some((f) => f.version === '23.0.0'));
});

test('each direction reports the population that decided it, not the dependency count', () => {
  // The defect this replaces: both verdicts printed `dependencies.length`, a
  // number that decides neither. Asserting the three are distinct is what makes
  // reintroducing the shared count fail here rather than read plausibly.
  const dependencies = [{ range: '>=18' }, { range: '>=20.9.0' }, { range: '^18 || >=20' }];
  const populations = directionPopulations('>=22.22.1 <23 || >=24', dependencies);
  assert.equal(populations.probes, populations.admitted + populations.excluded);
  assert.notEqual(populations.admitted, populations.declarations);
  assert.notEqual(populations.excluded, populations.declarations);
  assert.equal(populations.declarations, dependencies.length);
});

test('the partition sums even when the declared range admits nothing probed', () => {
  const dependencies = [{ range: '>=18' }];
  const populations = directionPopulations('>=90', dependencies);
  assert.equal(populations.probes, populations.admitted + populations.excluded);
  assert.equal(populations.admitted, 0);
});

test('a tree that is entirely unbounded above is reported as such', () => {
  const dependencies = [{ range: '>=18' }, { range: '^18 || >=20' }, { range: '>=20.9.0' }];
  const populations = directionPopulations('>=22.22.1 <23 || >=24', dependencies);
  assert.equal(populations.unboundedAbove, dependencies.length);
  // The consequence, which is the point of measuring it: nothing above the
  // highest bound anyone names can ever be flagged as wrongly excluded, so a
  // clean reading up there is vacuous rather than reassuring. Stated as a
  // comparison between two measurements of this fixture -- an earlier draft
  // asserted the literal 0, which was the real tree's value carried into a
  // fixture that does not have it, and the test caught the transplant.
  assert.ok(populations.excludedAboveHighestNamed > 0);
  // And every one of them is reported, without the tree being consulted --
  // which is the actual defect. Above the line "every dependency accepts it" is
  // unanimous by construction, so the finding is the declared range's own upper
  // bound handed back, not a measurement of it. An earlier draft asserted 0
  // here on the theory that the direction goes quiet up there; it does the
  // opposite, and only running it distinguished the two.
  const aboveLine = findExcludedCompatibilities('>=22.22.1 <23 || >=24', dependencies).filter(
    (entry) => Number(entry.version.split('.')[0]) > populations.highestNamedMajor,
  );
  assert.equal(aboveLine.length, populations.excludedAboveHighestNamed);
});

test('an open-ended declared range has no population above the line at all', () => {
  // The mirror case, and the one this repository is in: nothing is excluded up
  // there, so the clean verdict is guaranteed rather than earned.
  // Shaped like this repository: the tree names a major the declared range is
  // open above. A first draft put the declared floor *above* every major the
  // deps name, which leaves a real excluded population and is the other case.
  const dependencies = [{ range: '>=18' }, { range: '>=24.1.0' }];
  const populations = directionPopulations('>=22.22.1 <23 || >=24', dependencies);
  assert.equal(populations.unboundedAbove, dependencies.length);
  assert.equal(populations.highestNamedMajor, 24);
  assert.equal(populations.excludedAboveHighestNamed, 0);
  assert.ok(populations.excluded > 0);
});

test('a bounded-above dependency is counted as bounded', () => {
  // Discriminates the unbounded count from a constant: this range rejects the
  // probe, so the tally must fall below the declaration count.
  const dependencies = [{ range: '>=18' }, { range: '>=18 <24' }];
  const populations = directionPopulations('>=22.22.1', dependencies);
  assert.equal(populations.declarations, 2);
  assert.equal(populations.unboundedAbove, 1);
});

test('the unreachable probe is above every major the tree names', () => {
  // If this constant ever drifts below a real release, `unboundedAbove` starts
  // undercounting silently and the vacuity notice stops appearing.
  const dependencies = [{ range: '>=18' }, { range: '>=20.9.0 <21 || >=22' }];
  const populations = directionPopulations('>=22', dependencies);
  assert.ok(Number(UNREACHABLE_FUTURE_VERSION.split('.')[0]) > populations.highestNamedMajor);
  assert.equal(populations.highestNamedMajor, 22);
  // >=22 is a bare major with no minor or patch. A triple-only regex reads
  // it as naming nothing, which puts the line at 20 and over-claims the
  // unmeasurable region above it.
});

test('highestNamedMajor reads every literal in a range, not just the first', () => {
  const dependencies = [{ range: '^18.18.0 || ^20.9.0 || >=21.1.0' }];
  const populations = directionPopulations('>=22', dependencies);
  assert.equal(populations.highestNamedMajor, 21);
});
test('the rendered notice cites the direction population, not the dependency count', () => {
  // The unit test of directionPopulations cannot see this: swapping the
  // interpolation back to the dependency count leaves every computation test
  // green, because none of them read the sentence. This asserts against the
  // measured populations rather than literals, so it tracks the fixture.
  const dependencies = [{ range: '>=18' }, { range: '>=20.9.0' }, { range: '^18 || >=20' }];
  const declared = '>=22.22.1 <23 || >=24';
  const populations = directionPopulations(declared, dependencies);
  const lines = directionNotices(declared, populations, [], []).join('\n');
  assert.match(
    lines,
    new RegExp(`over the ${populations.admitted} probe version\\(s\\) it admits`),
  );
  assert.match(
    lines,
    new RegExp(`over the ${populations.excluded} probe version\\(s\\) it excludes`),
  );
  // And the two must be distinguishable from the count they used to print.
  assert.notEqual(populations.admitted, populations.declarations);
  assert.notEqual(populations.excluded, populations.declarations);
});

test('the scope line states a partition that sums to the probe set', () => {
  // This fixture splits 7/9. The obvious two-dependency fixture splits 7/7,
  // where printing the admitted count in both slots still sums to the probe
  // set -- a fixture chosen for realism rather than for discriminating power.
  const dependencies = [{ range: '^18.18.0 || ^20.9.0 || >=21.1.0' }, { range: '>=18' }];
  const declared = '>=22.22.1 <23 || >=24';
  const populations = directionPopulations(declared, dependencies);
  const scope = directionNotices(declared, populations, [], []).find((line) =>
    line.startsWith('scope:'),
  );
  const [, probes, admitted, excluded] = scope.match(
    /over (\d+) probe version\(s\) \((\d+) admitted, (\d+) excluded\)/,
  );
  assert.equal(Number(admitted) + Number(excluded), Number(probes));
  // Summing is not enough on its own: printing the admitted count in both
  // slots still sums correctly whenever a fixture happens to split in half,
  // and the first draft of this test used exactly such a fixture. Each half is
  // therefore checked against the population it names, and the two are asserted
  // to differ so the mutant cannot hide behind a symmetric split.
  assert.equal(Number(admitted), populations.admitted);
  assert.equal(Number(excluded), populations.excluded);
  assert.notEqual(populations.admitted, populations.excluded);
});

test('the unfalsifiable-upper-end notice appears only when the tree is all open above', () => {
  const declared = '>=22.22.1 <23 || >=24';
  const open = [{ range: '>=18' }, { range: '>=24.1.0' }];
  const closed = [{ range: '>=18' }, { range: '>=18 <26' }];
  const marker = /not evidence: all \d+ declaration\(s\) are unbounded above/;
  assert.match(
    directionNotices(declared, directionPopulations(declared, open), [], []).join('\n'),
    marker,
  );
  assert.doesNotMatch(
    directionNotices(declared, directionPopulations(declared, closed), [], []).join('\n'),
    marker,
  );
});

test('an empty tree does not claim its zero declarations are all unbounded', () => {
  // 0 === 0 would satisfy a naive equality and print the notice over nothing.
  const declared = '>=22.22.1 <23 || >=24';
  const populations = directionPopulations(declared, []);
  assert.equal(populations.declarations, 0);
  assert.equal(populations.unboundedAbove, 0);
  assert.doesNotMatch(
    directionNotices(declared, populations, [], []).join('\n'),
    /not evidence: all \d+ declaration\(s\) are unbounded above/,
  );
});

test('highestNamedMajor is the maximum, not the last literal read', () => {
  // Every other fixture happens to list its literals in ascending order, so
  // replacing Math.max with plain assignment passes all of them.
  const populations = directionPopulations('>=22', [{ range: '>=24.0.0 || ^18.1.0' }]);
  assert.equal(populations.highestNamedMajor, 24);
});
