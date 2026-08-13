import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NPM_LIFECYCLES,
  ROUTES,
  commandSegments,
  directRoute,
  reportLines,
  resolveRoutes,
  runsEquivalentCommand,
  scopeLines,
  scriptDeps,
  scriptPaths,
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
