#!/usr/bin/env node
/**
 * A gate is only a gate if it can fail, and the only proof of that is running it (#4340).
 *
 * `check-gate-enforcement.mjs` answers whether a gate is *wired* -- whether a workflow invokes it.
 * That is a property of the workflow files, and it is checkable by reading them. It says nothing
 * about whether the invoked program can produce a non-zero exit. A gate that is wired and cannot
 * fail is worse than one that is unwired, because it contributes a green check.
 *
 * finance has shipped exactly that: `check-gate-enforcement.mjs` was itself wired into CI and had
 * no exit code at all until #4333. It was found by hand. The tool whose subject is enforcement
 * gaps could not see the enforcement gap in itself, because the property is behavioural and every
 * instrument pointed at it was syntactic.
 *
 * A sibling session in `jrmoulckers/engineering` reached the same rule from three consecutive
 * detector failures -- a module reference assembled with `path.join` rather than `import`, a
 * `require` inside a string literal, and `process.exit(main(...))` with `return 1` rather than
 * `process.exit(1)`. Each was semantically ordinary and syntactically unanticipated. Their
 * formulation: if the property is "what does this program do," run the program. A grep answers
 * "how is this program written," which is a different question that happens to correlate.
 *
 * Four detectors written against finance's own tools were wrong before this file existed:
 *
 *   - `tools/*.mjs` as a population missed 2 of 15 gates, because `ai:manifest:check` runs a `.js`
 *     file and `eng:vendor:check` lives in `scripts/`.
 *   - `process.exit(1)` missed `process.exit(result.ok ? 0 : 1)`, a third form of the sibling's
 *     defect.
 *   - A predicted Windows-path defect in `check-gradle-prefetch.mjs` was refuted by running it:
 *     WHATWG `URL` normalises a drive letter, so the guard fires.
 *   - Accepting any non-zero exit as proof of teeth passed fixtures that had failed on a missing
 *     git repository, a missing `package.json`, and on the scan-root assertion added in #4339.
 *
 * The last one is why a proven entry must name a substring the output has to contain. An exit code
 * is a verdict; it can only be right or wrong about the question asked. Requiring the report to
 * name the violation asks the second question -- did it fail *for this reason* -- which a status
 * code cannot answer.
 *
 * Every gate in `CLAIMED_GATES` must appear in exactly one of `PROVEN` or `UNPROVEN`, so declaring
 * a new gate forces an answer rather than allowing silence. `UNPROVEN` reasons are criteria, not
 * states: a state ("no fixture written yet") stops being true without anything noticing, whereas a
 * criterion ("needs a populated node_modules, which makes the fixture depend on an install") stays
 * checkable.
 *
 * Usage: node tools/check-gate-teeth.mjs
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CLAIMED_GATES } from './check-gate-enforcement.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

/**
 * Modules every fixture receives, because several gates import them and a missing one fails the
 * run for a reason that is not the violation.
 */
const LIB = ['tools/lib/markdown.mjs', 'tools/lib/source.mjs'];

/**
 * Gates whose teeth are demonstrated by executing them against a fixture.
 *
 * `files` is written into a throwaway directory alongside a copy of the gate. `expect` is a
 * substring the report must contain; without it a fixture that failed to scaffold would count as
 * a pass. Every fixture here runs with no git repository and no `node_modules`, verified
 * deterministic across repeated passes -- a fixture that needs either is a fixture whose result
 * depends on the machine.
 */
export const PROVEN = {
  'tool:imports:check': {
    script: 'tools/check-tool-imports.mjs',
    files: {
      'package.json': '{"name":"fixture","version":"1.0.0"}\n',
      'tools/undeclared.mjs': "import x from 'totally-undeclared-package';\nexport default x;\n",
    },
    expect: 'totally-undeclared-package',
  },
  'markdown:primitives:check': {
    script: 'tools/check-markdown-primitives.mjs',
    files: {
      'scripts/.keep': '',
      'tools/rogue.mjs': 'const FENCE = /^\\s*(```|~~~)/;\nexport { FENCE };\n',
    },
    expect: 'rogue',
  },
  'bounds:check': {
    script: 'tools/check-assertion-bounds.mjs',
    files: {
      'tools/invented.test.mjs':
        "import assert from 'node:assert/strict';\nassert.ok(total() >= 4173);\n",
    },
    expect: '4173',
  },
  'gradle:prefetch:check': {
    script: 'tools/check-gradle-prefetch.mjs',
    files: {
      '.github/workflows/unprefetched.yml':
        'name: unprefetched\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ./gradlew build\n',
    },
    expect: 'Prefetch Gradle distribution',
  },
};

/**
 * Gates whose teeth are not demonstrated here, each with the criterion that keeps it out.
 *
 * These are open, not excused. The criterion is what a reader checks to decide whether the entry
 * still belongs; none of them is "nobody has written it yet," which would be a state and would
 * silently stop being true.
 */
export const UNPROVEN = {
  'eng:citations': {
    criterion: 'scans the whole repository, so a fixture large enough to trigger it is the tree',
  },
  'eng:vendor:check': {
    criterion: 'compares against a vendored upstream tree, which a fixture would have to vendor',
  },
  'ai:manifest:check': {
    criterion: 'requires a signed manifest whose stamp a fixture would have to forge',
  },
  'encoding:check': {
    criterion: 'enumerates tracked files via git, so the fixture needs a repository and an index',
  },
  'workflow:security:check': {
    criterion: 'imports js-yaml, so the fixture depends on an installed node_modules',
  },
  'upstream:refs:check': {
    criterion: 'resolves references against sibling repositories that a fixture cannot supply',
  },
  'citations:enumerations:check': {
    criterion: 'already executed with a non-zero assertion by check-citation-enumerations.test.mjs',
  },
  'node:version:check': {
    criterion: 'imports semver, so the fixture depends on an installed node_modules',
  },
  'docs:links:check': {
    criterion: 'enumerates tracked files via git, so the fixture needs a repository and an index',
  },
  'test:independence:check': {
    criterion: 'pairs tools with tests via git-tracked paths, so the fixture needs an index',
  },
  'gate:enforcement': {
    criterion: 'reads package.json scripts and workflow files together, so its fixture is a repo',
  },
  'gate:teeth': {
    criterion:
      'its fixture would need a copy of every gate it proves, so the fixture is the repository',
  },
};

/**
 * Write one file inside a fixture, creating parents.
 *
 * @param {string} root Fixture root.
 * @param {string} rel Repository-relative path.
 * @param {string} content File contents.
 * @returns {string} The absolute path written.
 */
function writeFixtureFile(root, rel, content) {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

/**
 * Remove exactly the files a fixture created, by name, deepest directory first.
 *
 * Recursive deletion is forbidden in this repository even against a temporary directory, so the
 * fixture tracks what it wrote and unlinks that. A path this function was not given survives,
 * which is the intended failure mode.
 *
 * @param {string[]} files Absolute file paths written.
 * @param {string} root Fixture root.
 * @returns {void}
 */
function removeFixture(files, root) {
  for (const file of files) {
    try {
      unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
  const dirs = [...new Set(files.map((file) => path.dirname(file)))].sort(
    (a, b) => b.length - a.length,
  );
  for (const dir of [...dirs, root]) {
    try {
      rmdirSync(dir);
    } catch {
      /* non-empty or already gone */
    }
  }
}

/**
 * Execute one gate against its fixture.
 *
 * @param {string} name Gate name.
 * @param {{script: string, files: Record<string, string>, expect: string}} spec Fixture.
 * @param {string} [repoRoot] Source of the gate and its libraries.
 * @returns {{name: string, status: number|null, named: boolean, ok: boolean, first: string}} What
 *   happened.
 */
export function proveTeeth(name, spec, repoRoot = REPO_ROOT) {
  const root = mkdtempSync(path.join(tmpdir(), 'gate-teeth-'));
  const written = [];
  try {
    written.push(
      writeFixtureFile(root, spec.script, readFileSync(path.join(repoRoot, spec.script), 'utf8')),
    );
    for (const lib of LIB) {
      written.push(writeFixtureFile(root, lib, readFileSync(path.join(repoRoot, lib), 'utf8')));
    }
    for (const [rel, content] of Object.entries(spec.files)) {
      written.push(writeFixtureFile(root, rel, content));
    }
    const result = spawnSync(process.execPath, [path.join(root, spec.script)], {
      cwd: root,
      encoding: 'utf8',
    });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const named = output.includes(spec.expect);
    const first = output.split('\n').find((line) => line.trim()) ?? '';
    return {
      name,
      status: result.status,
      named,
      ok: result.status !== 0 && named,
      first: first.trim(),
    };
  } finally {
    removeFixture(written, root);
  }
}

/**
 * Gates that answer the teeth question in neither table, and gates that answer it twice.
 *
 * @param {string[]} [claimed] Declared gates.
 * @param {object} [proven] Proven table.
 * @param {object} [unproven] Unproven table.
 * @returns {{undeclared: string[], doubled: string[], unknown: string[]}} Drift.
 */
export function tableDrift(claimed = CLAIMED_GATES, proven = PROVEN, unproven = UNPROVEN) {
  const undeclared = claimed.filter(
    (gate) => !Object.hasOwn(proven, gate) && !Object.hasOwn(unproven, gate),
  );
  const doubled = claimed.filter(
    (gate) => Object.hasOwn(proven, gate) && Object.hasOwn(unproven, gate),
  );
  const known = new Set(claimed);
  const unknown = [...Object.keys(proven), ...Object.keys(unproven)].filter(
    (gate) => !known.has(gate),
  );
  return { undeclared, doubled, unknown };
}

/**
 * Run every proven fixture and describe the result.
 *
 * @param {object} [proven] Proven table.
 * @param {string} [repoRoot] Source of the gates.
 * @returns {{lines: string[], failed: boolean}} Report.
 */
export function report(proven = PROVEN, repoRoot = REPO_ROOT) {
  const lines = [];
  const results = Object.entries(proven).map(([name, spec]) => proveTeeth(name, spec, repoRoot));
  const drift = tableDrift();

  lines.push(`Executed ${results.length} gate(s) against a violating fixture:`);
  for (const result of results) {
    const verdict = result.ok
      ? 'teeth'
      : result.status === 0
        ? 'NO TEETH (exited 0 over a violation)'
        : 'FAILED FOR ANOTHER REASON (report did not name the violation)';
    lines.push(`  ${result.name} -> exit ${result.status} ${verdict}`);
    if (!result.ok) lines.push(`      first line: ${result.first}`);
  }

  lines.push('');
  lines.push(`${Object.keys(UNPROVEN).length} declared gate(s) have teeth unproven here:`);
  for (const [name, entry] of Object.entries(UNPROVEN)) {
    lines.push(`  ${name}`);
    lines.push(`      criterion: ${entry.criterion}`);
  }

  const failures = results.filter((result) => !result.ok);
  if (drift.undeclared.length > 0) {
    lines.push('');
    lines.push('Declared gate(s) answering the teeth question in neither table:');
    for (const gate of drift.undeclared) lines.push(`  ${gate}`);
    lines.push('Add a fixture to PROVEN, or a criterion to UNPROVEN.');
  }
  if (drift.doubled.length > 0) {
    lines.push('');
    lines.push('Gate(s) present in both tables:');
    for (const gate of drift.doubled) lines.push(`  ${gate}`);
  }
  if (drift.unknown.length > 0) {
    lines.push('');
    lines.push('Table entr(ies) naming no declared gate:');
    for (const gate of drift.unknown) lines.push(`  ${gate}`);
  }

  lines.push('');
  lines.push(
    'A non-zero exit alone is not proof: a fixture that fails to scaffold also exits non-zero.',
  );
  lines.push('Each row above required the report to name the violation it was given.');

  return {
    lines,
    failed:
      failures.length > 0 ||
      drift.undeclared.length > 0 ||
      drift.doubled.length > 0 ||
      drift.unknown.length > 0,
  };
}

/**
 * Entry point.
 *
 * @returns {void}
 */
function main() {
  const result = report();
  for (const line of result.lines) console.log(line);
  process.exitCode = result.failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
