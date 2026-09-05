#!/usr/bin/env node
/**
 * Run the vendored citation checker and reject file exclusions that are not explicitly
 * declared with a reason below.
 *
 * Usage: node tools/check-citation-exclusions.mjs [citation-checker arguments]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PRAGMA_TEXT = 'citations-check' + ': ignore-file';
const SKIP_LINE = new RegExp(`^(\\d+) file\\(s\\) skipped via "${PRAGMA_TEXT}":\\s*(.+)$`, 'm');

export const DECLARED_EXCLUSIONS = Object.freeze({});

export function parseCitationExclusions(output) {
  const match = output.match(SKIP_LINE);
  if (!match) {
    if (output.includes('skipped via')) {
      throw new Error('Citation checker reported skipped files in an unrecognized format.');
    }
    return [];
  }

  const expectedCount = Number.parseInt(match[1], 10);
  const paths = match[2]
    .split(',')
    .map((file) => file.trim().replaceAll('\\', '/'))
    .filter(Boolean);

  if (paths.length !== expectedCount) {
    throw new Error(
      `Citation checker reported ${expectedCount} exclusion(s), but ${paths.length} path(s) were parsed.`,
    );
  }
  return paths;
}

export function undeclaredCitationExclusions(
  excludedPaths,
  declaredExclusions = DECLARED_EXCLUSIONS,
) {
  return excludedPaths.filter((file) => {
    const reason = declaredExclusions[file];
    return typeof reason !== 'string' || reason.trim().length === 0;
  });
}

function printHelp() {
  console.log(
    'Usage: node tools/check-citation-exclusions.mjs [citation-checker arguments]\n' +
      'Runs the vendored checker and fails when a skipped file lacks an explicit reason.',
  );
}

export function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    printHelp();
    return 0;
  }

  const checker = path.resolve(
    process.cwd(),
    'config',
    'engineering',
    'citations',
    'check-citations.mjs',
  );
  const checkerArgs = args.length > 0 ? args : ['.'];
  const result = spawnSync(process.execPath, [checker, ...checkerArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  process.stdout.write(stdout);
  process.stderr.write(stderr);

  if (result.status !== 0) {
    console.error('Citation exclusions could not be checked because the citation checker failed.');
    return result.status ?? 1;
  }

  let excludedPaths;
  try {
    excludedPaths = parseCitationExclusions(`${stdout}\n${stderr}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const undeclared = undeclaredCitationExclusions(excludedPaths);
  if (undeclared.length > 0) {
    console.error('Undeclared citation exclusion(s) detected:');
    for (const file of undeclared) console.error(`  ${file}`);
    console.error('Declare each excluded path with a non-empty reason before allowing it.');
    return 1;
  }

  console.log(
    `Citation exclusions verified: ${excludedPaths.length} declared exclusion(s), none undeclared.`,
  );
  return 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
