#!/usr/bin/env node
/**
 * Census which `package.json` scripts are actually invoked by a workflow.
 *
 * A gate is a workflow step, not a script. A `package.json` entry behaves identically to a gate
 * every time a human runs it, and identically to nothing the rest of the time -- so "the script
 * passes" and "the script is required to pass" are different claims that produce the same output.
 *
 * Two properties this instrument exists to hold, both learned from getting them wrong:
 *
 * 1. The population is **every** root script, never a suffix-filtered subset. An earlier hand
 *    census looked at scripts ending in `:check` and thereby excluded `eng:citations`, which the
 *    same document lists as a gate. Selecting by naming convention is a proxy for gate-ness, and
 *    the proxy had known exceptions inside the document that used it.
 *
 * 2. Resolution tries **several** routes and reports which one matched. An orphan list is a claim
 *    of absence; a single-route matcher cannot distinguish "not wired" from "wired by a route I
 *    did not implement". Two such false positives were caught in practice -- one here, one
 *    upstream -- and both were caught by colliding with prior knowledge rather than by any
 *    instrument. Naming the matching route makes a false positive visible to a reader who does
 *    not already know the answer.
 */

import fs from 'node:fs';
import path from 'node:path';

export const WORKFLOW_DIR = '.github/workflows';

/** npm subcommands that run a same-named script without the `run` keyword. */
export const NPM_LIFECYCLES = ['test', 'start', 'stop', 'restart'];

/** Routes by which a script can reach a workflow, in the order they are tried. */
export const ROUTES = ['npm run', 'npm lifecycle', 'file path', 'transitive', 'equivalent command'];

/**
 * Split a script body into the commands it runs, dropping `npm run` delegations.
 *
 * @param {string} body Script body from `package.json`.
 * @returns {string[]} Command segments.
 */
export function commandSegments(body) {
  return body
    .split(/&&|\|\||;/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('npm run'));
}

/**
 * Decide whether a workflow runs the same command as a script, without going through the script.
 *
 * This is a distinct verdict from "reached", and keeping it distinct is the point. CI runs
 * `npx eslint . --max-warnings 0 --cache ...` directly rather than `npm run lint`, so the script
 * `lint` is genuinely unreached while the check it performs is genuinely enforced. An earlier hand
 * census conflated those, treating an unreached script as an unenforced gate. **An unreached
 * script does not imply an unenforced check, and a reached one does not imply a required one.**
 *
 * Matching is by prefix, because a workflow commonly appends flags the script omits.
 *
 * @param {string} body Script body.
 * @param {string} corpus Concatenated workflow text.
 * @returns {boolean} True when some command segment also runs directly in a workflow.
 */
export function runsEquivalentCommand(body, corpus) {
  return commandSegments(body).some((segment) => corpus.includes(segment));
}

/**
 * Extract file paths a script body executes, so a workflow calling the tool directly still counts.
 *
 * @param {string} body Script body from `package.json`.
 * @returns {string[]} Referenced paths, e.g. `tools/check-x.mjs`.
 */
export function scriptPaths(body) {
  return [...body.matchAll(/(?:^|\s)([\w./-]+\.(?:mjs|cjs|js|ts|sh))(?=\s|$)/g)].map((m) => m[1]);
}

/**
 * Extract script names a script body invokes via `npm run`.
 *
 * @param {string} body Script body from `package.json`.
 * @returns {string[]} Invoked script names.
 */
export function scriptDeps(body) {
  return [...body.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
}

/**
 * Decide whether a workflow corpus invokes a script directly.
 *
 * Returns the name of the matching route rather than a boolean, so a "wired" verdict carries its
 * own evidence and a wrong route is visible without knowing the right answer in advance.
 *
 * @param {string} name Script name.
 * @param {string} body Script body.
 * @param {string} corpus Concatenated workflow text.
 * @returns {string | null} Matching route name, or `null` when none matched.
 */
export function directRoute(name, body, corpus) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`npm run ${escaped}(?![\\w:-])`).test(corpus)) return 'npm run';
  if (NPM_LIFECYCLES.includes(name) && new RegExp(`npm ${escaped}(?![\\w:-])`).test(corpus)) {
    return 'npm lifecycle';
  }
  for (const p of scriptPaths(body)) {
    if (corpus.includes(p)) return 'file path';
  }
  return null;
}

/**
 * Resolve every script to the route that reaches a workflow, following transitive invocation.
 *
 * @param {Record<string, string>} scripts Script name to body.
 * @param {string} corpus Concatenated workflow text.
 * @returns {Record<string, string | null>} Script name to matching route, or `null`.
 */
export function resolveRoutes(scripts, corpus) {
  const routes = {};
  for (const [name, body] of Object.entries(scripts)) {
    routes[name] = directRoute(name, body, corpus);
  }
  // A script invoked by a wired script is itself enforced. Iterate to a fixed point rather than a
  // single pass, so a chain of any depth resolves and the result does not depend on key order.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, body] of Object.entries(scripts)) {
      if (routes[name] !== null) continue;
      for (const dep of Object.keys(scripts)) {
        if (routes[dep] === null) continue;
        if (scriptDeps(scripts[dep]).includes(name)) {
          routes[name] = 'transitive';
          changed = true;
          break;
        }
      }
      void body;
    }
  }
  // Equivalent-command detection runs last so a direct or transitive route always wins the label.
  for (const [name, body] of Object.entries(scripts)) {
    if (routes[name] === null && runsEquivalentCommand(body, corpus)) {
      routes[name] = 'equivalent command';
    }
  }
  return routes;
}

/**
 * The scripts this repository *claims* are CI gates, and the evidence for scripts excluded (#4333).
 *
 * Until now the gate set existed only in prose -- "16/16 gates pass" appeared in every verification
 * summary of this workstream, and nothing derived or checked that list. An aggregate a reader
 * cannot check is one a reader cannot disagree with, so a member that never gated was undetectable.
 *
 * `agent:check` was in that reported set for fifteen rounds. It runs
 * `tools/agent-scripts/pre-push-check.js`, which exits 1 on failure and 0 on success -- gate form --
 * and is invoked by **nothing**. Not CI: two independent instruments (this tool's route resolution
 * and a raw substring scan of the joined workflow corpus) agree it resolves to no route. Not the
 * hook it is named for either: `.husky/pre-push` exists and runs `prettier --check`, `eslint`, and
 * a secret scan, and never mentions it. The only two references in the tree are its own
 * `package.json` entry and a guide paragraph.
 *
 * Membership here is a claim that a script must be able to fail CI. Adding a script to this list
 * without wiring it fails this gate, which is the property the prose version could not have.
 */
export const CLAIMED_GATES = [
  'eng:citations',
  'eng:vendor:check',
  'ai:manifest:check',
  'encoding:check',
  'workflow:security:check',
  'upstream:refs:check',
  'gradle:prefetch:check',
  'tool:imports:check',
  'citations:enumerations:check',
  'node:version:check',
  'docs:links:check',
  'test:independence:check',
  'bounds:check',
  'markdown:primitives:check',
  'gate:enforcement',
];

/**
 * Scripts that look like gates and deliberately are not, with the evidence rather than the verdict.
 *
 * A bare exclusion list records that someone decided; naming what was checked lets the next reader
 * disagree with the decision instead of trusting it.
 */
export const NOT_GATES = {
  'agent:check':
    'developer pre-push helper. Runs tools/agent-scripts/pre-push-check.js, which is in gate form ' +
    '(exit 1 on failure) but is invoked by no workflow AND by no hook -- .husky/pre-push does not ' +
    'call it. Recorded rather than wired: wiring it would change local behaviour for humans, which ' +
    'is a separate decision from correcting the reported gate set',
};

/**
 * Claimed gates that reach no workflow, so the claim is false rather than merely unverified.
 *
 * @param {Record<string, string | null>} routes Script name to matching route.
 * @param {string[]} claimed Scripts asserted to be CI gates.
 * @returns {{name: string, reason: string}[]} Failing claims, ascending by name.
 */
export function unenforcedClaims(routes, claimed = CLAIMED_GATES) {
  const failing = [];
  for (const name of [...claimed].sort()) {
    if (!Object.hasOwn(routes, name)) {
      failing.push({ name, reason: 'claimed as a gate but not defined in package.json' });
    } else if (routes[name] === null) {
      failing.push({ name, reason: 'claimed as a gate but reached by no workflow' });
    }
  }
  return failing;
}

/**
 * The claimed-gate census, itemised on both paths.
 *
 * Per gate with its route rather than `15/15`, because a count is true at the same moment the set
 * is wrong, and a reader cannot check a count against what they already know.
 *
 * @param {Record<string, string | null>} routes Script name to matching route.
 * @param {string[]} claimed Scripts asserted to be CI gates.
 * @returns {string[]} Report lines.
 */
export function claimedGateLines(routes, claimed = CLAIMED_GATES) {
  const failing = unenforcedClaims(routes, claimed);
  const lines = [
    '',
    `Declared CI gates: ${claimed.length}. Each must resolve to a workflow route; the set is`,
    '  checked here rather than stated in prose, because the reported set was wrong for fifteen',
    '  rounds and nothing could detect it (#4333).',
  ];
  for (const name of [...claimed].sort()) {
    lines.push(`  ${name.padEnd(30)} ${routes[name] ?? 'NO ROUTE'}`);
  }
  const excluded = Object.keys(NOT_GATES).sort();
  lines.push(
    `Gate-shaped scripts deliberately excluded: ${excluded.length === 0 ? 'none.' : ''}`,
    ...excluded.flatMap((name) => [`  ${name}`, `    ${NOT_GATES[name]}`]),
  );
  if (failing.length > 0) {
    lines.push(
      '',
      'Declared gate(s) that cannot fail CI:',
      ...failing.map((f) => `  ${f.name}: ${f.reason}`),
      'Either wire it into a workflow, or move it to NOT_GATES with the evidence.',
    );
  }
  return lines;
}

/**
 * Summarise a census.
 *
 * @param {Record<string, string | null>} routes Script name to matching route.
 * @returns {string[]} Report lines.
 */
export function reportLines(routes) {
  const names = Object.keys(routes);
  const wired = names.filter((n) => routes[n] !== null);
  const equivalent = names.filter((n) => routes[n] === 'equivalent command');
  const invoked = wired.length - equivalent.length;
  const lines = [
    `scripts in package.json     ${names.length}`,
    `  invoked by a workflow     ${invoked}`,
    `  same command runs, but    ${equivalent.length}`,
    `    not via the script`,
    `  reached by nothing        ${names.length - wired.length}`,
    '',
  ];
  for (const route of ROUTES) {
    lines.push(`  via ${route.padEnd(20)}${wired.filter((n) => routes[n] === route).length}`);
  }
  return lines;
}

/**
 * State what this census counted and by which routes, so its claim of absence carries its scope.
 *
 * @param {Record<string, string | null>} routes Script name to matching route.
 * @param {number} workflowCount Number of workflow files read.
 * @returns {string[]} Scope lines.
 */
export function scopeLines(routes, workflowCount) {
  const total = Object.keys(routes).length;
  return [
    `Scope: all ${total} root scripts, not a suffix-filtered subset -- an earlier census counted`,
    `  only names ending in ':check' and so excluded eng:citations, a gate.`,
    `  Corpus: ${workflowCount} workflow file(s) under ${WORKFLOW_DIR}.`,
    `  Routes tried: ${ROUTES.join(', ')}. A script reached by none is reported unreached,`,
    `  which is a claim of absence bounded by exactly these ${ROUTES.length} routes.`,
    `  An unreached script does not imply an unenforced check: the 'equivalent command' bucket`,
    `  is where the workflow runs the same command without going through the script.`,
  ];
}

/**
 * Render the unreached list, naming each script.
 *
 * @param {Record<string, string | null>} routes Script name to matching route.
 * @returns {string[]} Report lines, empty when everything is reached.
 */
export function unreachedLines(routes) {
  const orphans = Object.keys(routes)
    .filter((n) => routes[n] === null)
    .sort();
  if (orphans.length === 0) return [];
  return ['', 'reached by no workflow:', ...orphans.map((n) => `  ${n}`)];
}

/**
 * Read and concatenate the workflow corpus.
 *
 * @param {string} [dir] Workflow directory.
 * @returns {{corpus: string, count: number}} Concatenated text and file count.
 */
export function readWorkflows(dir = WORKFLOW_DIR) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  const corpus = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  return { corpus, count: files.length };
}

function main() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const { corpus, count } = readWorkflows();
  const routes = resolveRoutes(pkg.scripts ?? {}, corpus);
  for (const line of reportLines(routes)) console.log(line);
  console.log('');
  for (const line of scopeLines(routes, count)) console.log(line);
  for (const line of unreachedLines(routes)) console.log(line);
  for (const line of claimedGateLines(routes)) console.log(line);
  // Until now this tool was itself wired and toothless: it printed a census and always exited 0, so
  // it satisfied "runs in CI" without being able to fail it. It now fails on exactly one claim --
  // that every declared gate can fail CI -- which is narrow enough to be true and checkable, and is
  // the claim whose prose version was wrong for fifteen rounds (#4333).
  if (unenforcedClaims(routes).length > 0) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('check-gate-enforcement.mjs')) {
  main();
}
