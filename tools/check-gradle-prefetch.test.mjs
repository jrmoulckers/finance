import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PREFETCH_STEP_NAME,
  findUncoveredConditions,
  findUnguardedGradleJobs,
  invokesGradle,
  isPrefetchStep,
  scanGradlePrefetch,
  splitJobs,
  splitSteps,
  stepCondition,
} from './check-gradle-prefetch.mjs';

const prefetch = (condition) =>
  [
    `      - name: ${PREFETCH_STEP_NAME}`,
    ...(condition ? [`        if: ${condition}`] : []),
    '        run: ./gradlew --version',
  ].join('\n');

const workflow = (steps) => ['jobs:', '  build:', '    steps:', ...steps].join('\n');

test('splitJobs finds every job and stops at the next top-level key', () => {
  const jobs = splitJobs(
    ['jobs:', '  a:', '    steps: []', '  b:', '    steps: []', 'on:'].join('\n'),
  );
  assert.deepEqual(
    jobs.map((job) => job.name),
    ['a', 'b'],
  );
});

test('splitJobs returns nothing when there is no jobs block', () => {
  assert.deepEqual(splitJobs('name: x\non: push\n'), []);
});

test('splitSteps keeps multi-line run blocks with their step', () => {
  const steps = splitSteps(
    [
      '    steps:',
      '      - name: one',
      '        run: |',
      '          echo a',
      '      - name: two',
    ].join('\n'),
  );
  assert.equal(steps.length, 2);
  assert.match(steps[0], /echo a/);
});

test('invokesGradle matches an inline run, which a line-anchored grep misses', () => {
  assert.equal(invokesGradle('      - run: ./gradlew clean --no-daemon'), true);
});

test('invokesGradle matches a block run and the Windows wrapper', () => {
  assert.equal(invokesGradle('        run: |\n          ./gradlew build'), true);
  assert.equal(invokesGradle('        run: gradlew.bat build'), true);
});

test('invokesGradle does not match a substring of another word', () => {
  assert.equal(invokesGradle('        run: echo mygradlewrapper'), false);
  assert.equal(invokesGradle('        run: npm test'), false);
});

test('isPrefetchStep matches only the exact step name', () => {
  assert.equal(isPrefetchStep(`      - name: ${PREFETCH_STEP_NAME}`), true);
  assert.equal(isPrefetchStep('      - name: Prefetch Gradle distribution cache'), false);
});

test('a job with no wrapper call is not a violation', () => {
  assert.deepEqual(findUnguardedGradleJobs('w.yml', workflow(['      - run: npm ci'])), []);
});

test('a wrapper call with no prefetch is a violation', () => {
  const found = findUnguardedGradleJobs('w.yml', workflow(['      - run: ./gradlew build']));
  assert.equal(found.length, 1);
  assert.match(found[0], /no "Prefetch Gradle distribution" step/);
});

test('a prefetch before the wrapper call passes', () => {
  assert.deepEqual(
    findUnguardedGradleJobs('w.yml', workflow([prefetch(), '      - run: ./gradlew build'])),
    [],
  );
});

test('a prefetch after the wrapper call is a violation, because order is the point', () => {
  const found = findUnguardedGradleJobs(
    'w.yml',
    workflow(['      - run: ./gradlew build', prefetch()]),
  );
  assert.equal(found.length, 1);
  assert.match(found[0], /runs second warms nothing/);
});

test('stepCondition reads an if and returns null without one', () => {
  assert.equal(stepCondition(prefetch("matrix.os == 'a'")), "matrix.os == 'a'");
  assert.equal(stepCondition(prefetch()), null);
});

test('an unconditional prefetch covers every later leg', () => {
  const steps = splitSteps(
    workflow([prefetch(), "      - if: matrix.os == 'a'\n        run: ./gradlew build"]),
  );
  assert.deepEqual(findUncoveredConditions(steps, steps.findIndex(isPrefetchStep)), []);
});

test('a conditional prefetch does not cover a differently guarded leg', () => {
  const body = workflow([
    prefetch("matrix.os == 'a'"),
    "      - if: matrix.os == 'b'\n        run: ./gradlew build",
  ]);
  const found = findUnguardedGradleJobs('w.yml', body);
  assert.equal(found.length, 1);
  assert.match(found[0], /that leg fetches unwarmed/);
});

test('a conditional prefetch does not cover an unconditional leg', () => {
  const found = findUnguardedGradleJobs(
    'w.yml',
    workflow([prefetch("matrix.os == 'a'"), '      - run: ./gradlew build']),
  );
  assert.equal(found.length, 1);
  assert.match(found[0], /runs under "no condition"/);
});

test('a disjunction covering both legs passes, which is the release-platform shape', () => {
  assert.deepEqual(
    findUnguardedGradleJobs(
      'w.yml',
      workflow([
        prefetch("matrix.platform == 'android' || matrix.platform == 'windows'"),
        "      - if: matrix.platform == 'android'\n        run: ./gradlew a",
        "      - if: matrix.platform == 'windows'\n        run: ./gradlew w",
      ]),
    ),
    [],
  );
});

test('scanGradlePrefetch reports across files and names each one', () => {
  const found = scanGradlePrefetch({
    'a.yml': workflow(['      - run: ./gradlew build']),
    'b.yml': workflow([prefetch(), '      - run: ./gradlew build']),
  });
  assert.equal(found.length, 1);
  assert.match(found[0], /^a\.yml:/);
});

test('the emulator action carrying a wrapper call in its inputs still counts', () => {
  const found = findUnguardedGradleJobs(
    'w.yml',
    workflow([
      '      - uses: reactivecircus/android-emulator-runner@0000000000000000000000000000000000000000\n        with:\n          script: ./gradlew connectedCheck',
    ]),
  );
  assert.equal(found.length, 1);
});
