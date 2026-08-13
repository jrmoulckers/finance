import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLAIMED_GATES,
  NOT_GATES,
  NPM_LIFECYCLES,
  ROUTES,
  claimedGateLines,
  commandSegments,
  directRoute,
  reportLines,
  resolveRoutes,
  runsEquivalentCommand,
  scopeLines,
  scriptDeps,
  scriptPaths,
  staleExclusions,
  unenforcedClaims,
  unreachedLines,
} from './check-gate-enforcement.mjs';

test('scriptPaths finds a script file executed by the body', () => {
  assert.deepEqual(scriptPaths('node tools/check-x.mjs --flag'), ['tools/check-x.mjs']);
});

test('scriptPaths finds several paths in one body', () => {
  assert.deepEqual(scriptPaths('node a/b.mjs && bash c/d.sh'), ['a/b.mjs', 'c/d.sh']);
});

test('scriptPaths ignores bodies with no file reference', () => {
  assert.deepEqual(scriptPaths('npx eslint . --max-warnings 0'), []);
});

test('scriptDeps finds delegated script names', () => {
  assert.deepEqual(scriptDeps('npm run a && npm run b:c'), ['a', 'b:c']);
});

test('directRoute matches an npm run invocation', () => {
  assert.equal(directRoute('lint', 'x', 'run: npm run lint\n'), 'npm run');
});

test('directRoute does not match a longer script name by prefix', () => {
  assert.equal(directRoute('lint', 'x', 'run: npm run lint:fix\n'), null);
});

test('directRoute matches a bare npm lifecycle', () => {
  assert.equal(directRoute('test', 'x', 'run: npm test -w apps/web\n'), 'npm lifecycle');
});

test('directRoute does not treat a non-lifecycle name as a bare invocation', () => {
  assert.equal(directRoute('lint', 'x', 'run: npm lint\n'), null);
});

test('NPM_LIFECYCLES covers the subcommands that run a same-named script', () => {
  assert.ok(NPM_LIFECYCLES.includes('test'));
  assert.ok(!NPM_LIFECYCLES.includes('lint'));
});

test('directRoute matches a tool invoked by path', () => {
  const corpus = 'run: node tools/check-x.mjs\n';
  assert.equal(directRoute('x:check', 'node tools/check-x.mjs', corpus), 'file path');
});

test('directRoute prefers npm run over file path when both would match', () => {
  const corpus = 'npm run x:check\nnode tools/check-x.mjs\n';
  assert.equal(directRoute('x:check', 'node tools/check-x.mjs', corpus), 'npm run');
});

test('commandSegments drops npm run delegations', () => {
  assert.deepEqual(commandSegments('npm run a && npx eslint .'), ['npx eslint .']);
});

test('commandSegments splits on every chaining operator', () => {
  assert.equal(commandSegments('a && b || c; d').length, 4);
});

test('runsEquivalentCommand matches when a workflow appends flags', () => {
  assert.equal(
    runsEquivalentCommand('npx eslint . --max-warnings 0', 'npx eslint . --max-warnings 0 --cache'),
    true,
  );
});

test('runsEquivalentCommand is false when the command does not appear', () => {
  assert.equal(runsEquivalentCommand('npx eslint .', 'npm ci'), false);
});

test('resolveRoutes follows a transitive invocation', () => {
  const scripts = { outer: 'npm run inner', inner: 'node x.mjs' };
  const routes = resolveRoutes(scripts, 'run: npm run outer\n');
  assert.equal(routes.outer, 'npm run');
  assert.equal(routes.inner, 'transitive');
});

test('resolveRoutes follows a chain deeper than one level', () => {
  const scripts = { a: 'npm run b', b: 'npm run c', c: 'node x.mjs' };
  const routes = resolveRoutes(scripts, 'run: npm run a\n');
  assert.equal(routes.c, 'transitive');
});

test('resolveRoutes does not mark a script reachable through an unreached one', () => {
  const scripts = { outer: 'npm run inner', inner: 'node x.mjs' };
  const routes = resolveRoutes(scripts, 'run: npm ci\n');
  assert.equal(routes.inner, null);
});

test('resolveRoutes labels an equivalent command distinctly from an invocation', () => {
  const scripts = { lint: 'npx eslint .' };
  const routes = resolveRoutes(scripts, 'run: npx eslint . --cache\n');
  assert.equal(routes.lint, 'equivalent command');
});

test('resolveRoutes prefers a direct route over the equivalent-command label', () => {
  const scripts = { lint: 'npx eslint .' };
  const routes = resolveRoutes(scripts, 'run: npm run lint\nrun: npx eslint .\n');
  assert.equal(routes.lint, 'npm run');
});

test('resolveRoutes returns null for a script nothing reaches', () => {
  assert.equal(resolveRoutes({ solo: 'node x.mjs' }, 'run: npm ci\n').solo, null);
});

const routes = {
  a: 'npm run',
  b: 'transitive',
  c: 'equivalent command',
  d: null,
  e: null,
};

test('reportLines separates invocation from equivalent command', () => {
  const lines = reportLines(routes);
  assert.ok(lines.some((l) => l.includes('invoked by a workflow     2')));
  assert.ok(lines.some((l) => l.includes('same command runs, but    1')));
  assert.ok(lines.some((l) => l.includes('reached by nothing        2')));
});

test('reportLines does not count an equivalent command as an invocation', () => {
  const only = reportLines({ c: 'equivalent command' });
  assert.ok(only.some((l) => l.includes('invoked by a workflow     0')));
});

test('reportLines states a per-route count for every route', () => {
  const lines = reportLines(routes);
  for (const route of ROUTES) {
    assert.ok(
      lines.some((l) => l.includes(`via ${route}`)),
      `missing route line for ${route}`,
    );
  }
});

test('scopeLines names the population and rejects the suffix subset', () => {
  const lines = scopeLines(routes, 31);
  assert.ok(lines[0].includes('all 5 root scripts'));
  assert.ok(lines.some((l) => l.includes('eng:citations')));
});

test('scopeLines states the corpus size by value', () => {
  assert.ok(scopeLines(routes, 31).some((l) => l.includes('31 workflow file(s)')));
});

test('scopeLines bounds its claim of absence by the routes tried', () => {
  const lines = scopeLines(routes, 31);
  assert.ok(lines.some((l) => l.includes(`these ${ROUTES.length} routes`)));
});

test('scopeLines says an unreached script is not an unenforced check', () => {
  assert.ok(scopeLines(routes, 31).some((l) => l.includes('does not imply an unenforced check')));
});

test('unreachedLines names each unreached script', () => {
  const lines = unreachedLines(routes);
  assert.ok(lines.includes('  d'));
  assert.ok(lines.includes('  e'));
});

test('unreachedLines returns nothing when everything is reached', () => {
  assert.deepEqual(unreachedLines({ a: 'npm run' }), []);
});

test('a claimed gate that reaches no workflow is a failure, not an omission (#4333)', () => {
  // The defect this closes: `agent:check` was reported as a gate for fifteen rounds while being
  // invoked by nothing. The prose version of the set could not fail, because prose has no failure
  // path. Membership is now a claim the tool checks.
  const routes = { 'a:check': 'npm run', 'b:check': null };
  assert.deepEqual(unenforcedClaims(routes, ['a:check']), [], 'a wired claim passes');
  assert.deepEqual(unenforcedClaims(routes, ['a:check', 'b:check']), [
    { name: 'b:check', reason: 'claimed as a gate but reached by no workflow' },
  ]);
});

test('a claimed gate that no longer exists fails differently from one that is unwired', () => {
  // Two distinct ways the claim goes stale, and they need different fixes: a renamed script must be
  // renamed here, an unwired one must be wired. A single message would send the reader to the wrong
  // remedy in one of the two cases.
  const [gone] = unenforcedClaims({ 'a:check': 'npm run' }, ['ghost:check']);
  assert.match(gone.reason, /not defined in package\.json/);
  const [unwired] = unenforcedClaims({ 'a:check': null }, ['a:check']);
  assert.match(unwired.reason, /reached by no workflow/);
  assert.notEqual(gone.reason, unwired.reason);
});

test('the claimed-gate census itemises the route per gate on the passing path', () => {
  // A `15/15` line is true at the same moment the set is wrong, and a reader cannot check it
  // against what they already know. A row per gate can be disagreed with.
  const lines = claimedGateLines({ 'a:check': 'npm run', 'b:check': 'file path' }, [
    'a:check',
    'b:check',
  ]);
  assert.ok(lines.some((l) => l.includes('a:check') && l.includes('npm run')));
  assert.ok(lines.some((l) => l.includes('b:check') && l.includes('file path')));
  assert.ok(!lines.some((l) => l.includes('cannot fail CI')), 'no failure block when all resolve');
});

test('the failing census is distinguishable from the passing one and states both remedies', () => {
  const lines = claimedGateLines({ 'a:check': 'npm run', 'b:check': null }, ['a:check', 'b:check']);
  assert.ok(lines.some((l) => l.includes('Declared gate(s) that cannot fail CI')));
  assert.ok(
    lines.some((l) => l.includes('NO ROUTE')),
    'the unwired gate is marked in the listing',
  );
  assert.ok(lines.some((l) => /wire it into a workflow, or move it to NOT_GATES/.test(l)));
});

test('every excluded gate-shaped script records evidence, not just a verdict', () => {
  // A bare exclusion list records that someone decided. Naming what was checked lets the next
  // reader disagree with the decision instead of trusting it.
  for (const [name, reason] of Object.entries(NOT_GATES)) {
    assert.ok(String(reason).trim().length > 0, `${name} states why it is not a gate`);
    assert.ok(!CLAIMED_GATES.includes(name), `${name} cannot be both claimed and excluded`);
  }
});

test('the declared set is named, distinct, and excludes the script that motivated it', () => {
  assert.deepEqual([...new Set(CLAIMED_GATES)], CLAIMED_GATES, 'no duplicate claims');
  assert.ok(!CLAIMED_GATES.includes('agent:check'), 'the fifteen-round miscount stays corrected');
  assert.ok(Object.hasOwn(NOT_GATES, 'agent:check'), 'and is recorded rather than dropped');
});

test('an exclusion that becomes workflow-reached is a failure, not a silent survivor (#4335)', () => {
  // #4333 gave the claimed set a failure path and left the exclusion list without one. A reason
  // that describes a state stops being true when the tree changes, with nobody editing this file.
  const excluded = { 'x:check': { criterion: 'c', state: 's' } };
  assert.deepEqual(
    staleExclusions({ 'x:check': null }, excluded),
    [],
    'still unreached, still valid',
  );
  assert.deepEqual(staleExclusions({ 'x:check': 'npm run' }, excluded), [
    { name: 'x:check', route: 'npm run' },
  ]);
});

test('an exclusion missing from package.json is not reported as stale', () => {
  // Deleted is not the same as wired. Only the second invalidates the recorded state, and
  // conflating them would send the reader to add a deleted script to CLAIMED_GATES.
  assert.deepEqual(staleExclusions({}, { 'x:check': { criterion: 'c', state: 's' } }), []);
});

test('every exclusion separates the durable criterion from the checked state', () => {
  // The criterion survives the tree changing; the state is re-derived rather than trusted. Fusing
  // them into one prose blob is what made neither checkable.
  for (const [name, reason] of Object.entries(NOT_GATES)) {
    assert.ok(reason.criterion?.trim(), `${name} states a criterion`);
    assert.ok(reason.state?.trim(), `${name} states a checkable state`);
    assert.notEqual(reason.criterion, reason.state);
  }
});

test('the stale-exclusion report names the route and is distinct from the unenforced-claim block', () => {
  const lines = claimedGateLines({ 'a:check': 'npm run' }, ['a:check']);
  assert.ok(!lines.some((l) => l.includes('no longer true')), 'clean tree reports no staleness');
  assert.ok(lines.some((l) => l.includes('criterion:')) && lines.some((l) => l.includes('state:')));
});
