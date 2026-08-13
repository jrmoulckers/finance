import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SENTINEL,
  measure,
  mutateSite,
  perToolLines,
  reportLines,
  elapsedLine,
  refusalLine,
  reportSites,
  scopeLines,
  survivorLines,
  toolsWithTests,
  wiredTools,
} from './check-report-assertions.mjs';

// Cross-reporting tests (#4303).

const CROSS = {
  caught: ['a.mjs:1 ${x}', 'a.mjs:2 ${y}', 'b.mjs:1 ${z}'],
  survivors: ['b.mjs:2 ${w}', 'b.mjs:3 ${v}', 'b.mjs:4 ${u}', 'c.mjs:1 ${t}'],
};

test('perToolLines decomposes the aggregate the survivor list alone cannot', () => {
  const lines = perToolLines(CROSS, new Set(['a.mjs'])).join('\n');
  // a: 2 caught / 0 survivors = 2/2. b: 1 caught / 3 survivors = 1/4. c: 0/1.
  assert.match(lines, /a\.mjs\s+2\/2\s+100%/);
  assert.match(lines, /b\.mjs\s+1\/4\s+25%/);
  assert.match(lines, /c\.mjs\s+0\/1\s+0%/);
});

test('perToolLines marks only tools present in the wired set as gates', () => {
  const lines = perToolLines(CROSS, new Set(['a.mjs'])).join('\n');
  assert.match(lines, /a\.mjs.*\byes$/m);
  assert.match(lines, /b\.mjs.*\bno$/m);
  assert.match(lines, /c\.mjs.*\bno$/m);
});

test('perToolLines counts all four quadrants and they sum to the tool count', () => {
  const lines = perToolLines(CROSS, new Set(['a.mjs', 'c.mjs']));
  const read = (label) => Number(lines.find((l) => l.includes(label)).match(/(\d+)$/)[1]);
  assert.equal(read('gate,  asserted'), 1); // a: wired, 100%
  assert.equal(read('gate,  unasserted'), 1); // c: wired, 0%
  assert.equal(read('inert, asserted'), 0);
  assert.equal(read('inert, unasserted'), 1); // b: inert, 25%
  const total =
    read('gate,  asserted') +
    read('gate,  unasserted') +
    read('inert, asserted') +
    read('inert, unasserted');
  assert.equal(total, 3, 'every tool lands in exactly one quadrant');
});

test('perToolLines places a tool at exactly the 50% boundary on the asserted side', () => {
  const half = { caught: ['h.mjs:1 ${a}'], survivors: ['h.mjs:2 ${b}'] };
  const lines = perToolLines(half, new Set()).join('\n');
  assert.match(lines, /h\.mjs\s+1\/2\s+50%/);
  assert.match(lines, /inert, asserted {4}1/);
});

test('perToolLines sorts by rate so the worst-asserted tools are last', () => {
  const rows = perToolLines(CROSS, new Set())
    .filter((l) => /\.mjs/.test(l))
    .map((l) => l.trim().split(/\s+/)[0]);
  assert.deepEqual(rows, ['a.mjs', 'b.mjs', 'c.mjs']);
});

test('wiredTools discriminates: it must not return every tool in the directory', () => {
  const wired = wiredTools();
  assert.ok(wired.size > 0, 'at least one tool is invoked by a workflow');
  const all = toolsWithTests('tools');
  const unwired = all.filter((t) => !wired.has(t));
  // A detector that reports everything as wired would make the cross vacuous and the
  // off-diagonal empty by construction rather than by measurement.
  assert.ok(unwired.length > 0, `expected some unwired tools; got ${JSON.stringify(all)}`);
});

test('wiredTools resolves a tool reached indirectly through an npm script', () => {
  const fake = {
    readFileSync: (p) =>
      String(p).endsWith('package.json')
        ? JSON.stringify({ scripts: { 'x:check': 'node tools/check-x.mjs --strict' } })
        : 'jobs:\n  a:\n    steps:\n      - run: npm run x:check\n',
    readdirSync: () => ['ci.yml'],
  };
  const wired = wiredTools(fake);
  assert.ok(wired.has('check-x.mjs'), [...wired].join(','));
});

test('wiredTools does not mark a script that no workflow invokes', () => {
  const fake = {
    readFileSync: (p) =>
      String(p).endsWith('package.json')
        ? JSON.stringify({ scripts: { 'y:check': 'node tools/check-y.mjs' } })
        : 'jobs:\n  a:\n    steps:\n      - run: npm test\n',
    readdirSync: () => ['ci.yml'],
  };
  assert.equal(wiredTools(fake).has('check-y.mjs'), false);
});

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

test('survivorLines returns nothing when every site is asserted', () => {
  assert.deepEqual(survivorLines([]), []);
});

test('survivorLines lists each survivor by value', () => {
  const lines = survivorLines(['a.mjs:1  ${x}', 'b.mjs:2  ${y}']);
  assert.ok(lines.includes('  a.mjs:1  ${x}'));
  assert.ok(lines.includes('  b.mjs:2  ${y}'));
});

test('survivorLines heads the list so it is not read as report output', () => {
  assert.equal(survivorLines(['a.mjs:1  ${x}'])[1], 'unasserted sites:');
});

test('elapsedLine reports seconds to one decimal', () => {
  assert.equal(elapsedLine(30800), 'elapsed                 30.8s');
});

test('elapsedLine distinguishes durations that differ only below a second', () => {
  assert.notEqual(elapsedLine(1100), elapsedLine(1900));
  assert.equal(elapsedLine(1100), 'elapsed                 1.1s');
});

test('refusalLine names the tool and carries the reason verbatim', () => {
  assert.equal(refusalLine('tree is dirty'), 'check-report-assertions: tree is dirty');
});

test('reportSites finds interpolations in returned template literals', () => {
  assert.deepEqual(
    reportSites('  return `count ${n}`;').map((s) => s.expr),
    ['n'],
  );
});

test('reportSites finds interpolations in bare template array elements', () => {
  const src = ['const lines = [', '  `a ${x}`,', '  `b ${y}`,', '];'].join('\n');
  assert.deepEqual(
    reportSites(src).map((s) => s.expr),
    ['x', 'y'],
  );
});

test('reportSites still ignores a template assigned to a variable', () => {
  assert.deepEqual(reportSites('  const x = `${a}`;'), []);
});

test('reportSites counts a returned template and a logged one alike', () => {
  const logged = reportSites('console.log(`${v}`);');
  const returned = reportSites('  return `${v}`;');
  assert.equal(logged.length, returned.length);
});
