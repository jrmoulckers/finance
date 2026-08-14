import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
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

test('a repo-backed fixture leaves no directory behind', () => {
  // Regression for a leak in the first version (#4340): cleanup enumerated
  // dirname() of each written file, which never yields an intermediate
  // directory created on the way to a nested one. The gradle fixture writes
  // .github/workflows/x.yml, so .github survived every run and left the root
  // non-empty -- 24 orphaned directories accumulated before anything counted
  // them. The population of directories created is not the population of
  // dirnames written.
  const before = new Set(
    readdirSync(tmpdir(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('gate-teeth-'))
      .map((e) => e.name),
  );
  const repoBacked = Object.entries(PROVEN).filter(([, spec]) => spec.repo);
  assert.ok(repoBacked.length > 0, 'no repo-backed fixture to exercise');
  for (const [name, spec] of repoBacked) proveTeeth(name, spec);
  const after = readdirSync(tmpdir(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('gate-teeth-'))
    .map((e) => e.name)
    .filter((n) => !before.has(n));
  assert.deepEqual(after, [], 'a fixture directory outlived the run that made it');
});

test('a repo-backed fixture is actually a repository, so the gate is not passing by accident', () => {
  // Without this, a gate that enumerates via git would report an empty
  // population and exit 0, and the entry would look like a wrong criterion
  // rather than a broken fixture.
  for (const [name, spec] of Object.entries(PROVEN)) {
    if (!spec.repo) continue;
    const result = proveTeeth(name, spec);
    assert.notEqual(result.status, 0, `${name} exited zero against its violation`);
    assert.ok(result.named, `${name} failed without naming ${spec.expect}`);
  }
});

test('an unproven criterion declares whether it was executed or reasoned', () => {
  // Three of the original twelve criteria were reasoned from reading the tool
  // and were false (#4343). A criterion is itself a claim about behaviour, so
  // it carries the same burden as the prose this file exists to check.
  for (const [name, spec] of Object.entries(UNPROVEN)) {
    assert.equal(typeof spec.tested, 'boolean', `${name} does not say whether it was tested`);
  }
});

// A subject whose exit depends on the fixture, so a control overlay can genuinely clear it.
const CONDITIONAL =
  "import { readFileSync } from 'node:fs';\n" +
  'let bad = false;\n' +
  "try { if (readFileSync('defect.txt', 'utf8').trim() === 'yes') { console.log('found the-actual-violation here'); bad = true; } } catch {}\n" +
  "try { if (readFileSync('other.txt', 'utf8').trim() === 'yes') { console.log('an unrelated second failure'); bad = true; } } catch {}\n" +
  'process.exit(bad ? 1 : 0);\n';

test('a control that exits zero makes the failure attributable to the injected defect', () => {
  withScript(CONDITIONAL, (root) => {
    const result = proveTeeth(
      'fake:gate',
      {
        script: 'tools/subject.mjs',
        files: { 'defect.txt': 'yes\n' },
        control: { 'defect.txt': 'no\n' },
        expect: 'the-actual-violation',
      },
      root,
    );
    assert.equal(result.controlStatus, 0, 'the fixture is clean once the defect is removed');
    assert.equal(result.ok, true);
  });
});

test('a fixture that fails for two independent reasons is not proof', () => {
  withScript(CONDITIONAL, (root) => {
    const spec = {
      script: 'tools/subject.mjs',
      files: { 'defect.txt': 'yes\n', 'other.txt': 'yes\n' },
      expect: 'the-actual-violation',
    };
    const withoutControl = proveTeeth('fake:gate', spec, root);
    assert.equal(withoutControl.ok, true, 'exit code and substring alone accept it -- the defect');

    const withControl = proveTeeth(
      'fake:gate',
      { ...spec, control: { 'defect.txt': 'no\n' } },
      root,
    );
    assert.equal(withControl.status, 1, 'it still fails');
    assert.equal(withControl.named, true, 'and still names the violation');
    assert.equal(withControl.controlStatus, 1, 'but the control fails too');
    assert.equal(withControl.ok, false, 'so the failure is not attributable');
    assert.match(withControl.first, /not attributable/);
  });
});

test('every expected string is required, not merely one of them', () => {
  withScript("console.log('names only the first');\nprocess.exit(1);\n", (root) => {
    const result = proveTeeth(
      'fake:gate',
      {
        script: 'tools/subject.mjs',
        files: {},
        expect: ['names only the first', 'and the second'],
      },
      root,
    );
    assert.equal(result.named, false);
    assert.equal(result.ok, false);
    assert.match(result.first, /and the second/, 'the report says which one was missing');
  });
});

test('every proven entry either carries a control or says why none can exist', () => {
  for (const [name, spec] of Object.entries(PROVEN)) {
    const hasControl = spec.control !== undefined;
    const hasCriterion = typeof spec.controlCriterion === 'string';
    assert.ok(hasControl !== hasCriterion, `${name} must declare exactly one of the two`);
    if (hasCriterion) {
      // A criterion, not a state: it must name the obstacle, so a reader can check whether the
      // obstacle is still there rather than trust that nobody has got round to it. Tested by the
      // same shape the UNPROVEN table uses, rather than by a length threshold -- a threshold is a
      // number nothing commits to, and this file exists to reject exactly that kind of assertion.
      assert.ok(spec.controlCriterion.length > 0, `${name} has an empty criterion`);
      assert.ok(
        !/\byet\b|\bnot written\b|\btodo\b/i.test(spec.controlCriterion),
        `${name} states a condition that stops being true without anything noticing`,
      );
    }
  }
});

test('the shipped controls all pass, so no shipped fixture is dirty', () => {
  for (const [name, spec] of Object.entries(PROVEN)) {
    if (!spec.control) continue;
    const result = proveTeeth(name, spec);
    assert.equal(result.controlStatus, 0, `${name} control must exit 0`);
  }
});

test('a gate that has stopped accepting valid input is diagnosed by its control', () => {
  // Mutating a real gate to reject everything (#4357) produced exit 1 with a report naming
  // nothing, and the verdict blamed the report -- sending a reader to the message text when the
  // fact that mattered was that valid input had stopped passing. `named` is the symptom; the
  // control is the cause, so the control is tested first.
  const REJECT_ALL = "console.error('some unrelated complaint');\nprocess.exit(1);\n";
  withScript(REJECT_ALL, (root) => {
    const specs = {
      'fake:gate': {
        script: 'tools/subject.mjs',
        files: { 'defect.txt': 'yes\n' },
        control: { 'defect.txt': 'no\n' },
        expect: 'the-actual-violation',
      },
    };
    const { failed, lines } = report(specs, root);
    assert.equal(failed, true);
    const line = lines.find((entry) => entry.includes('fake:gate'));
    assert.match(line, /NOT ATTRIBUTABLE/, 'the control failure is the diagnosis');
    assert.ok(
      !line.includes('FAILED FOR ANOTHER REASON'),
      `the report naming must not outrank the control: ${line}`,
    );
    assert.match(line, /control exit 1/, 'and the control exit is shown');
  });
});

test('a report that names nothing while the control passes still blames the report', () => {
  // The other side of the precedence, so the reordering cannot silently swallow this case.
  const WRONG_COMPLAINT =
    "import { readFileSync } from 'node:fs';\n" +
    'let bad = false;\n' +
    "try { if (readFileSync('defect.txt', 'utf8').trim() === 'yes') { console.log('something else went wrong'); bad = true; } } catch {}\n" +
    'process.exit(bad ? 1 : 0);\n';
  withScript(WRONG_COMPLAINT, (root) => {
    const specs = {
      'fake:gate': {
        script: 'tools/subject.mjs',
        files: { 'defect.txt': 'yes\n' },
        control: { 'defect.txt': 'no\n' },
        expect: 'the-actual-violation',
      },
    };
    const { lines } = report(specs, root);
    const line = lines.find((entry) => entry.includes('fake:gate'));
    assert.match(line, /FAILED FOR ANOTHER REASON/);
    assert.match(line, /control exit 0/);
  });
});
