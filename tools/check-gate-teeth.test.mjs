import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CLAIMED_GATES } from './check-gate-enforcement.mjs';
import { PROVEN, UNPROVEN, proveTeeth, report, tableDrift } from './check-gate-teeth.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build a throwaway repository containing one script, and clean up by name.
 *
 * @param {string} body Script source.
 * @param {(root: string, script: string) => void} run Receives the fixture root and script path.
 * @returns {void}
 */
function withScript(body, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'teeth-test-'));
  const tools = path.join(root, 'tools');
  const lib = path.join(tools, 'lib');
  mkdirSync(lib, { recursive: true });
  const script = path.join(tools, 'subject.mjs');
  writeFileSync(script, body);
  writeFileSync(path.join(lib, 'markdown.mjs'), 'export const markFences = () => [];\n');
  writeFileSync(path.join(lib, 'source.mjs'), 'export const stripLiterals = (s) => s;\n');
  try {
    run(root, script);
  } finally {
    for (const file of [
      script,
      path.join(lib, 'markdown.mjs'),
      path.join(lib, 'source.mjs'),
      path.join(root, 'trigger.txt'),
    ]) {
      try {
        unlinkSync(file);
      } catch {
        /* not created by this case */
      }
    }
    for (const dir of [lib, tools, root]) {
      try {
        rmdirSync(dir);
      } catch {
        /* non-empty */
      }
    }
  }
}

test('every declared gate answers the teeth question in exactly one table', () => {
  const drift = tableDrift();
  assert.deepEqual(drift.undeclared, [], 'a declared gate names neither a fixture nor a criterion');
  assert.deepEqual(drift.doubled, [], 'a gate cannot be both proven and unproven');
  assert.deepEqual(drift.unknown, [], 'a table entry names a gate that is not declared');
});

test('the two tables partition the declared gates exactly', () => {
  const covered = new Set([...Object.keys(PROVEN), ...Object.keys(UNPROVEN)]);
  for (const gate of CLAIMED_GATES) assert.ok(covered.has(gate), `${gate} is unanswered`);
  assert.equal(covered.size, CLAIMED_GATES.length);
});

test('a gate that exits zero over its violation is reported as having no teeth', () => {
  withScript("console.log('all clear');\n", (root, script) => {
    const result = proveTeeth(
      'fake:gate',
      { script: 'tools/subject.mjs', files: {}, expect: 'all clear' },
      root,
    );
    assert.equal(result.status, 0);
    assert.equal(result.named, true, 'the expected substring is present, so only the exit fails');
    assert.equal(result.ok, false, 'naming the violation cannot rescue a zero exit');
    assert.ok(script.endsWith('subject.mjs'));
  });
});

test('a non-zero exit whose report does not name the violation is not proof', () => {
  withScript("console.error('scaffolding failed');\nprocess.exit(1);\n", (root) => {
    const result = proveTeeth(
      'fake:gate',
      { script: 'tools/subject.mjs', files: {}, expect: 'the-actual-violation' },
      root,
    );
    assert.equal(result.status, 1, 'it did fail');
    assert.equal(result.named, false, 'but not for the reason under test');
    assert.equal(result.ok, false, 'which is exactly the false positive this rejects');
  });
});

test('a gate that fails and names its violation is proof', () => {
  withScript("console.log('found the-actual-violation here');\nprocess.exit(1);\n", (root) => {
    const result = proveTeeth(
      'fake:gate',
      { script: 'tools/subject.mjs', files: {}, expect: 'the-actual-violation' },
      root,
    );
    assert.equal(result.ok, true);
  });
});

test('a ternary exit is detected, because the exit code is observed rather than matched', () => {
  withScript(
    "const ok = false;\nconsole.log('the-actual-violation');\nprocess.exit(ok ? 0 : 1);\n",
    (root) => {
      const result = proveTeeth(
        'fake:gate',
        { script: 'tools/subject.mjs', files: {}, expect: 'the-actual-violation' },
        root,
      );
      assert.equal(
        result.ok,
        true,
        'process.exit(cond ? 0 : 1) is invisible to a /exit\\(1\\)/ scan',
      );
    },
  );
});

test('a fixture file reaches the gate under test', () => {
  withScript(
    "import fs from 'node:fs';\n" +
      "const seen = fs.readFileSync(new URL('../trigger.txt', import.meta.url), 'utf8');\n" +
      'console.log(seen.trim());\n' +
      'process.exit(1);\n',
    (root) => {
      const result = proveTeeth(
        'fake:gate',
        {
          script: 'tools/subject.mjs',
          files: { 'trigger.txt': 'planted-content\n' },
          expect: 'planted-content',
        },
        root,
      );
      assert.equal(result.ok, true, 'the fixture is what the gate read');
    },
  );
});

test('every unproven entry states a criterion rather than a state', () => {
  for (const [gate, entry] of Object.entries(UNPROVEN)) {
    assert.equal(typeof entry.criterion, 'string', `${gate} has no criterion`);
    assert.ok(entry.criterion.length > 0, `${gate} has an empty criterion`);
    assert.ok(
      !/\byet\b|\bnot written\b|\btodo\b/i.test(entry.criterion),
      `${gate} states a condition that stops being true without anything noticing`,
    );
  }
});

test('every proven entry requires the report to name something', () => {
  for (const [gate, spec] of Object.entries(PROVEN)) {
    assert.ok(spec.expect && spec.expect.length > 0, `${gate} would accept any non-zero exit`);
    assert.ok(spec.script.endsWith('.mjs') || spec.script.endsWith('.js'), `${gate} script shape`);
  }
});

test('the shipped fixtures all demonstrate teeth', () => {
  const result = report(PROVEN, repoRoot);
  assert.equal(result.failed, false, result.lines.join('\n'));
  for (const gate of Object.keys(PROVEN)) {
    assert.ok(
      result.lines.some((line) => line.includes(gate) && line.includes('teeth')),
      `${gate} is not reported as proven`,
    );
  }
});

test('the report itemises every gate rather than summarising a count', () => {
  const result = report(PROVEN, repoRoot);
  const text = result.lines.join('\n');
  for (const gate of [...Object.keys(PROVEN), ...Object.keys(UNPROVEN)]) {
    assert.ok(text.includes(gate), `${gate} is absent from a report a reader must check by name`);
  }
});
