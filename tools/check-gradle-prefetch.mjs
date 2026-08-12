#!/usr/bin/env node
/**
 * Verifies that every workflow job invoking the Gradle wrapper first warms the
 * distribution through a retrying prefetch step.
 *
 * The wrapper fetches its distribution with `networkTimeout=10000` and retries
 * zero times, so a transient reset from services.gradle.org fails the job before
 * anything is compiled. A prefetch step scoped to the download makes that class
 * of failure recoverable without making genuine build failures recoverable too.
 *
 * Cites ENG-BUILD-004 (reproducible builds) and ENG-TEST-006 (a flaky signal is
 * a broken signal).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKFLOW_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'workflows',
);

export const PREFETCH_STEP_NAME = 'Prefetch Gradle distribution';

function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

/**
 * Splits a workflow into jobs, returning `{ name, line, body }` for each.
 * Text-based on purpose: the sibling workflow checkers parse the same way, and
 * a YAML loader would resolve anchors this check must see literally.
 */
export function splitJobs(workflow) {
  const lines = normalize(workflow).split('\n');
  const jobsStart = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsStart === -1) return [];
  const jobs = [];
  let current = null;
  for (let index = jobsStart + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      if (current) jobs.push(current);
      current = { name: header[1], line: index + 1, body: [] };
      continue;
    }
    if (/^\S/.test(line) && line.trim() !== '') {
      break;
    }
    if (current) current.body.push(line);
  }
  if (current) jobs.push(current);
  return jobs.map((job) => ({ ...job, body: job.body.join('\n') }));
}

/**
 * Returns the step blocks of a job in order. A step starts at a `- name:`,
 * `- uses:` or `- run:` entry at the job's step indentation.
 */
export function splitSteps(jobBody) {
  const lines = normalize(jobBody).split('\n');
  const steps = [];
  let current = null;
  let indent = null;
  for (const line of lines) {
    const start = line.match(/^(\s*)- (?:name|uses|run|id|if):/);
    if (start && (indent === null || start[1].length === indent)) {
      indent = start[1].length;
      if (current) steps.push(current.join('\n'));
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) steps.push(current.join('\n'));
  return steps;
}

const GRADLEW = /(^|[\s"'`&|(])\.?\/?gradlew(\.bat)?[\s"'`)]/;

export function invokesGradle(step) {
  return GRADLEW.test(`${step}\n`);
}

export function isPrefetchStep(step) {
  return new RegExp(`- name:\\s*${PREFETCH_STEP_NAME}\\s*$`, 'm').test(step);
}

export function stepCondition(step) {
  // `if:` may be the step's leading key (`- if: ...`) or a following one, and a
  // check that reads only the second form silently reports "no condition" for a
  // guarded step -- turning a covered leg into a false violation.
  const line = step.split('\n').find((entry) => /^\s*(?:-\s*)?if:/.test(entry));
  return line ? line.replace(/^\s*(?:-\s*)?if:\s*/, '').trim() : null;
}

/**
 * A conditional prefetch only covers the legs its own condition admits. Rather
 * than evaluate matrix expressions, require the guarded step's condition to
 * appear verbatim in the prefetch condition -- under-deciding on anything else,
 * so this can flag a real gap without inventing one.
 */
export function findUncoveredConditions(steps, prefetchIndex) {
  const guard = stepCondition(steps[prefetchIndex]);
  if (guard === null) return [];
  return steps
    .slice(prefetchIndex + 1)
    .filter(invokesGradle)
    .map(stepCondition)
    .filter((condition) => condition === null || !guard.includes(condition));
}

/**
 * A job is compliant when no step invokes the wrapper, or when the prefetch
 * step appears before the first step that does. Ordering is the whole point: a
 * prefetch after the first real invocation warms nothing.
 */
export function findUnguardedGradleJobs(file, workflow) {
  const violations = [];
  for (const job of splitJobs(workflow)) {
    const steps = splitSteps(job.body);
    const firstGradle = steps.findIndex((step) => invokesGradle(step));
    if (firstGradle === -1) continue;
    const prefetch = steps.findIndex((step) => isPrefetchStep(step));
    if (prefetch === -1) {
      violations.push(
        `${file}: job "${job.name}" invokes the Gradle wrapper with no "${PREFETCH_STEP_NAME}" step; ` +
          'a transient distribution fetch failure fails the job (ENG-TEST-006)',
      );
      continue;
    }
    for (const uncovered of findUncoveredConditions(steps, prefetch)) {
      violations.push(
        `${file}: job "${job.name}" prefetches under "${stepCondition(steps[prefetch])}" but a later ` +
          `wrapper step runs under "${uncovered ?? 'no condition'}"; that leg fetches unwarmed (ENG-TEST-006)`,
      );
    }
    if (prefetch > firstGradle) {
      violations.push(
        `${file}: job "${job.name}" runs "${PREFETCH_STEP_NAME}" after step ${firstGradle + 1}, ` +
          'which already invoked the wrapper; a prefetch that runs second warms nothing (ENG-TEST-006)',
      );
    }
  }
  return violations;
}

export function scanGradlePrefetch(workflows) {
  return Object.entries(workflows).flatMap(([file, text]) => findUnguardedGradleJobs(file, text));
}

function loadWorkflows() {
  const workflows = {};
  for (const entry of readdirSync(WORKFLOW_DIR)) {
    if (!/\.ya?ml$/.test(entry)) continue;
    workflows[entry] = readFileSync(path.join(WORKFLOW_DIR, entry), 'utf8');
  }
  return workflows;
}

function main() {
  const workflows = loadWorkflows();
  const gradleJobs = Object.entries(workflows).reduce(
    (total, [, text]) =>
      total + splitJobs(text).filter((job) => splitSteps(job.body).some(invokesGradle)).length,
    0,
  );
  const violations = scanGradlePrefetch(workflows);
  if (violations.length > 0) {
    console.error('Gradle prefetch check failed:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(
      `\n${violations.length} of ${gradleJobs} Gradle job(s) across ${Object.keys(workflows).length} workflow(s).`,
    );
    process.exit(1);
  }
  console.log(
    `${gradleJobs} Gradle job(s) across ${Object.keys(workflows).length} workflow(s) prefetch the distribution before use.`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
