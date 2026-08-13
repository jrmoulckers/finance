import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SENTINEL,
  measure,
  mutateSite,
  reportLines,
  reportSites,
  scopeLines,
  toolsWithTests,
} from './check-report-assertions.mjs';

test('reportSites finds interpolations in console calls', () => {
  const src = ['console.log(`count ${n}`);'].join('\n');
  const sites = reportSites(src);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].line, 1);
  assert.equal(sites[0].expr, 'n');
});

test('reportSites finds interpolations in pushed template lines', () => {
  const src = ['lines.push(`total ${a} of ${b}`);'].join('\n');
  const sites = reportSites(src);
  assert.deepEqual(
    sites.map((s) => s.expr),
    ['a', 'b'],
  );
});

test('reportSites ignores interpolation outside report-building calls', () => {
  const src = ['const x = `${a}`;', 'throw new Error(`${b}`);'].join('\n');
  assert.deepEqual(reportSites(src), []);
});

test('reportSites ignores report lines with no interpolation', () => {
  assert.deepEqual(reportSites('console.log("static");'), []);
});

test('reportSites reports 1-based line numbers', () => {
  const src = ['// a', '// b', 'console.log(`${v}`);'].join('\n');
  assert.equal(reportSites(src)[0].line, 3);
});

test('mutateSite substitutes the sentinel for the whole expression', () => {
  const lines = ['console.log(`count ${n}`);'];
  const out = mutateSite(lines, { line: 1, expr: 'n' }, '${0}');
  assert.equal(out[0], 'console.log(`count ${0}`);');
});

test('mutateSite leaves other lines untouched', () => {
  const lines = ['const a = 1;', 'console.log(`${n}`);', 'const b = 2;'];
  const out = mutateSite(lines, { line: 2, expr: 'n' }, '${0}');
  assert.equal(out[0], 'const a = 1;');
  assert.equal(out[2], 'const b = 2;');
});

test('mutateSite does not mutate the input array', () => {
  const lines = ['console.log(`${n}`);'];
  mutateSite(lines, { line: 1, expr: 'n' }, '${0}');
  assert.equal(lines[0], 'console.log(`${n}`);');
});

test('mutateSite returns null when the substitution is a no-op', () => {
  const lines = ['console.log(`${0}`);'];
  assert.equal(mutateSite(lines, { line: 1, expr: '0' }, '${0}'), null);
});

test('mutateSite substitutes only the first occurrence of a repeated expression', () => {
  const lines = ['console.log(`${n} ${n}`);'];
  const out = mutateSite(lines, { line: 1, expr: 'n' }, '${0}');
  assert.equal(out[0], 'console.log(`${0} ${n}`);');
});

test('toolsWithTests pairs tools with colocated test files', () => {
  const fake = {
    readdirSync: () => ['b.mjs', 'b.test.mjs', 'a.mjs'],
    existsSync: (p) => p.endsWith('b.test.mjs'),
  };
  assert.deepEqual(toolsWithTests('tools', fake), ['b.mjs']);
});

test('toolsWithTests excludes test files themselves', () => {
  const fake = { readdirSync: () => ['a.test.mjs'], existsSync: () => true };
  assert.deepEqual(toolsWithTests('tools', fake), []);
});

test('toolsWithTests returns a sorted list', () => {
  const fake = { readdirSync: () => ['z.mjs', 'a.mjs'], existsSync: () => true };
  assert.deepEqual(toolsWithTests('tools', fake), ['a.mjs', 'z.mjs']);
});

const baseResult = {
  tools: 3,
  allTools: 5,
  caught: ['a.mjs:1  ${x}'],
  survivors: ['b.mjs:2  ${y}', 'b.mjs:3  ${z}'],
  unmeasurable: 0,
  skippedRed: [],
  sentinel: DEFAULT_SENTINEL,
};

test('reportLines states every count by value', () => {
  const lines = reportLines(baseResult);
  assert.equal(lines[0], 'tools with tests        3');
  assert.equal(lines[1], 'interpolation sites     3');
  assert.equal(lines[2], '  detected by a test    1');
  assert.equal(lines[3], '  unasserted            2');
});

test('reportLines derives the site total from both outcome lists', () => {
  const lines = reportLines({ ...baseResult, caught: [], survivors: [] });
  assert.equal(lines[1], 'interpolation sites     0');
});

test('reportLines omits the unmeasurable line when there are none', () => {
  assert.ok(!reportLines(baseResult).some((l) => l.includes('unmeasurable')));
});

test('reportLines states the unmeasurable count when nonzero', () => {
  const lines = reportLines({ ...baseResult, unmeasurable: 4 });
  assert.ok(lines.some((l) => l.includes('unmeasurable          4')));
});

test('reportLines omits the red-baseline line when there are none', () => {
  assert.ok(!reportLines(baseResult).some((l) => l.includes('red baseline')));
});

test('reportLines names each red-baseline tool', () => {
  const lines = reportLines({ ...baseResult, skippedRed: ['x.mjs', 'y.mjs'] });
  const line = lines.find((l) => l.includes('red baseline'));
  assert.ok(line.includes('2'));
  assert.ok(line.includes('x.mjs'));
  assert.ok(line.includes('y.mjs'));
});

test('scopeLines states the measured and total tool counts', () => {
  const lines = scopeLines(baseResult);
  assert.ok(lines[0].includes('3 of 5'));
});

test('scopeLines states the untested residual by value', () => {
  const line = scopeLines(baseResult).find((l) => l.includes('no test file'));
  assert.ok(line.startsWith('  2 tool(s)'), line);
});

test('scopeLines says untested tools are unmeasured rather than asserted', () => {
  const line = scopeLines(baseResult).find((l) => l.includes('no test file'));
  assert.ok(line.includes('not counted as asserted'));
});

test('scopeLines omits the residual line when every tool is measured', () => {
  const lines = scopeLines({ ...baseResult, tools: 5, allTools: 5 });
  assert.ok(!lines.some((l) => l.includes('no test file')));
});

test('scopeLines reports the sentinel in use', () => {
  const lines = scopeLines({ ...baseResult, sentinel: '${-1}' });
  assert.ok(lines.some((l) => l.includes('${-1}')));
});

test('scopeLines explains why a red baseline is disqualifying', () => {
  const lines = scopeLines({ ...baseResult, skippedRed: ['x.mjs'] });
  assert.ok(lines.some((l) => l.includes('every mutant look caught')));
});

test('measure skips a tool whose baseline is red and never mutates it', () => {
  const result = measure({ dir: 'tools', run: () => false });
  assert.equal(result.caught.length, 0);
  assert.equal(result.survivors.length, 0);
  assert.ok(result.skippedRed.length > 0);
  assert.equal(result.tools, 0);
});

test('measure excludes red-baseline tools from the measured count', () => {
  const result = measure({ dir: 'tools', run: () => false });
  assert.equal(result.tools, 0);
  assert.ok(result.allTools > 0);
});

test('measure counts every site as unasserted when no test ever fails', () => {
  const result = measure({ dir: 'tools', run: () => true });
  assert.equal(result.caught.length, 0);
  assert.ok(result.survivors.length > 0);
});

test('measure records the sentinel it was given', () => {
  const result = measure({ dir: 'tools', run: () => false, sentinel: '${"M"}' });
  assert.equal(result.sentinel, '${"M"}');
});

test('measure defaults to the documented sentinel', () => {
  const result = measure({ dir: 'tools', run: () => false });
  assert.equal(result.sentinel, DEFAULT_SENTINEL);
});
