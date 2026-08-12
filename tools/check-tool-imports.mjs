#!/usr/bin/env node
/**
 * Fails when a script under `tools/` or `scripts/` imports a package the
 * repository never declares.
 *
 * npm hoists transitive dependencies into the root `node_modules`, so an
 * undeclared import resolves and every check that uses it passes. The
 * dependency is real but its provider is incidental: it is reachable only
 * while some *other* package continues to depend on it at a version that
 * hoists. Nothing in the tree states the requirement, so nothing fails when it
 * stops being true -- the tool simply stops loading, and a gate that cannot
 * load is a gate that does not run.
 *
 * This is the same defect class as a pin with no canonical source: the
 * reference is satisfiable and uncompared. Declaring the dependency is what
 * gives it a referent.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';

const BUILTINS = new Set(builtinModules);

/** Directories whose top-level scripts run from the repository root. */
export const SCANNED_DIRECTORIES = ['tools', 'scripts'];

/**
 * Selects the executable tooling files, excluding test files.
 *
 * A test for an import checker must contain import statements as *data*, so
 * scanning tests makes the checker report its own fixtures -- which is what
 * this one did on its first run against the real tree. Reading a fixture as
 * code is an over-report, and this is a gate, so the population excludes tests
 * and the summary states how many were skipped rather than leaving the
 * denominator implied.
 */
export function isScannedFile(name) {
  const text = String(name ?? '');
  return /\.(mjs|cjs|js)$/.test(text) && !/\.test\.(mjs|cjs|js)$/.test(text);
}

/**
 * Reduces an import specifier to the package name npm would resolve.
 *
 * `@scope/name/sub` is a two-segment package; `name/sub` is one. Returns null
 * for anything that is not a bare specifier -- relative and absolute paths and
 * `node:` builtins are resolved by the filesystem or the runtime, never by a
 * manifest, so they have no declaration to check against.
 */
export function bareSpecifier(specifier) {
  const text = String(specifier ?? '');
  if (!text || text.startsWith('.') || text.startsWith('/') || text.startsWith('node:'))
    return null;
  if (text.includes('${')) return null;
  const segments = text.split('/');
  const bare = text.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
  return bare || null;
}

/**
 * Collects every statically readable module reference in a source file.
 *
 * Only literal specifiers are collected. A computed specifier is left out
 * rather than guessed at: this check exists to report a missing declaration,
 * and a checker that reported one against an expression it could not read
 * would fail a correct tree. Under-decide, never over-report.
 */
export function findModuleReferences(text) {
  const source = String(text ?? '');
  const references = [];
  const patterns = [
    /^[^\n]*?\bimport\s[^'"\n]*?from\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /^[^\n]*?\bexport\s[^'"\n]*?from\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      references.push({ specifier: match[1], line });
    }
  }
  return references.sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier));
}

/** Reports references to packages absent from the declared dependency set. */
export function findUndeclaredReferences(file, text, declared) {
  const seen = new Set();
  const violations = [];
  for (const { specifier, line } of findModuleReferences(text)) {
    const bare = bareSpecifier(specifier);
    if (bare === null || BUILTINS.has(bare) || declared.has(bare)) continue;
    const key = `${bare}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push(
      `${file}:${line} imports "${bare}", which no package.json in this repository declares`,
    );
  }
  return violations;
}

/** Names every dependency the root manifest declares, in either group. */
export function declaredDependencies(manifest) {
  return new Set([
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
  ]);
}

function main() {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  const declared = declaredDependencies(manifest);

  const violations = [];
  let scanned = 0;
  let references = 0;
  let skipped = 0;

  for (const directory of SCANNED_DIRECTORIES) {
    const absolute = join(repositoryRoot, directory);
    if (!existsSync(absolute)) continue;
    for (const name of readdirSync(absolute)) {
      if (!/\.(mjs|cjs|js)$/.test(name)) continue;
      if (!isScannedFile(name)) {
        skipped += 1;
        continue;
      }
      const text = readFileSync(join(absolute, name), 'utf8');
      scanned += 1;
      references += findModuleReferences(text).length;
      violations.push(...findUndeclaredReferences(`${directory}/${name}`, text, declared));
    }
  }

  if (violations.length > 0) {
    console.error('Undeclared dependencies in repository tooling:');
    for (const violation of violations) console.error(`  ${violation}`);
    console.error(
      '\nAn undeclared import resolves only while an unrelated package happens to hoist it.',
    );
    console.error('Add it to devDependencies so the requirement is stated where it is checked.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `Tooling imports are declared: ${references} module reference(s) across ${scanned} file(s) in ${SCANNED_DIRECTORIES.join(', ')}; ${skipped} test file(s) excluded.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
