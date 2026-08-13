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
}

if (process.argv[1] && process.argv[1].endsWith('check-gate-enforcement.mjs')) {
  main();
}
