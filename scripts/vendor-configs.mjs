#!/usr/bin/env node
/**
 * Vendor the dependency-free shared configuration from `jrmoulckers/engineering`
 * at a pinned ref, without a package registry.
 *
 * Why this exists: GitHub Packages authenticates *every* read, including reads
 * of a public package. For a self-hosted product that means each contributor
 * and each self-hoster must mint a token before `install` succeeds — a real
 * onboarding regression, and one the package-visibility setting does not fix.
 * `@jrmoulckers/tsconfig` and `@jrmoulckers/prettier-config` have no runtime
 * dependencies, so they can be fetched directly and committed.
 *
 * `@jrmoulckers/eslint-config` is deliberately NOT vendorable here: it depends
 * on `@eslint/js`, `typescript-eslint`, `eslint-config-prettier` and `globals`
 * at runtime. Copying its source would push four version choices back onto
 * every consumer, which is the drift the shared layer exists to remove. Install
 * that one from the registry.
 *
 * Vendoring usually trades away the version signal a registry gives you. It
 * does not here: every fetch writes `engineering-configs.lock.json` recording
 * the ref and the SHA-256 of each file, so drift is detectable and a refresh is
 * a reviewable diff.
 *
 * Usage:
 *   node scripts/vendor-configs.mjs <ref> [--dest <dir>] [--set tsconfig,prettier]
 *
 * Files are written byte-identical to source — no generated header — so that
 * `git diff` after a re-run shows exactly what upstream changed and nothing
 * else. Provenance lives in the lock file instead.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';

const REPO = 'jrmoulckers/engineering';
const LOCK = 'engineering-configs.lock.json';

const SETS = {
  tsconfig: {
    // `extends` between these is relative, so a partial fetch produces a config
    // that resolves to nothing. The set is all-or-nothing on purpose.
    from: 'packages/tsconfig',
    files: [
      'base.json',
      'vite-app.json',
      'vite-node.json',
      'vite-react.json',
      'next.json',
      'node.json',
    ],
  },
  prettier: {
    from: 'packages/prettier-config',
    files: ['index.js', 'svelte.js'],
  },
  // Not a config — the ENG-* citation checker. It is vendored rather than copied
  // because upstream owns it and its header says it is "fetched over the network
  // and kept nowhere", which is exactly how finance ended up running a private
  // copy from a temp directory for fifteen pull requests. Content-hashing it here
  // is what catches the drift its own printed version number does not: the local
  // copy and `main` both declared v9 while differing by 2 KB.
  citations: {
    from: 'scripts',
    files: ['check-citations.mjs'],
  },
};

class VendorError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

/**
 * Throw rather than `process.exit()`. Exiting from inside an in-flight `fetch`
 * tears down a socket the runtime still owns, which on Windows surfaces as a
 * libuv assertion and a 0xC0000409 exit code instead of the message and the 1
 * that a consumer's CI can act on.
 */
function fail(message, hint) {
  throw new VendorError(message, hint);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dest' || arg === '--set') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) fail(`${arg} requires a value`);
      flags[arg.slice(2)] = value;
      i += 1;
    } else if (arg === '--check') {
      flags.check = true;
    } else if (arg.startsWith('--')) {
      fail(
        `unknown option ${arg}`,
        'Usage: vendor-configs.mjs <ref> [--dest <dir>] [--set a,b] | vendor-configs.mjs --check',
      );
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/**
 * Report whether a newer release exists. Never throws and never fails the
 * caller: a tag pushed upstream must not turn an unrelated PR red. Returns null
 * when the answer cannot be determined, which is treated the same as "fine" —
 * an offline or rate-limited runner is not a staleness signal.
 */
async function latestRef() {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.tag_name === 'string' ? body.tag_name : null;
  } catch {
    return null;
  }
}

/**
 * Verify the vendored tree still matches the lock, then report staleness.
 *
 * The split in severity is the whole point. Drift is a local integrity failure
 * — someone edited a generated file, or a write was lost — so it exits non-zero.
 * Staleness is an upstream event the consumer has not acted on yet, so it only
 * warns. Failing on staleness would make pinning automatic in effect: a red
 * build pressures the next person into bumping the ref without deciding to
 * accept the change, which is the property pinning exists to protect.
 */
async function check() {
  let lock;
  try {
    lock = JSON.parse(await readFile(LOCK, 'utf8'));
  } catch {
    fail(`no ${LOCK} found`, 'Run: node scripts/vendor-configs.mjs <ref>');
  }

  const entries = Object.entries(lock.files ?? {});
  if (entries.length === 0) fail(`${LOCK} records no files`, 'Re-run the vendor step.');

  const drifted = [];
  for (const [dest, meta] of entries) {
    let text;
    try {
      text = await readFile(dest, 'utf8');
    } catch {
      drifted.push(`${dest}: missing`);
      continue;
    }
    if (sha256(text) !== meta.sha256) drifted.push(`${dest}: content differs from the lock`);
  }

  if (drifted.length > 0) {
    fail(
      `${drifted.length} vendored file(s) drifted from ${LOCK}:\n  ${drifted.join('\n  ')}`,
      `These files are generated. Do not edit them — re-run: node scripts/vendor-configs.mjs ${lock.ref}`,
    );
  }

  process.stdout.write(`${entries.length} vendored file(s) match ${LOCK} at ${lock.ref}.\n`);

  const unloadable = await missingModuleMarkers(
    await Promise.all(
      entries.map(async ([dest]) => [dest, await readFile(dest, 'utf8').catch(() => '')]),
    ),
  );
  if (unloadable.length > 0) {
    fail(
      `${unloadable.length} vendored ESM file(s) lack a "type": "module" marker:\n  ${unloadable.join('\n  ')}`,
      'Add a package.json containing {"type":"module"} beside each. Without it, ' +
        'Node below 22.7 cannot import the file, and no other gate detects this.',
    );
  }

  const latest = await latestRef();
  if (latest && latest !== lock.ref) {
    // A newer tag is not the same claim as newer content, and conflating the two
    // makes this notice a false alarm most of the time. Measured on 2026-08-12:
    // pinned v0.15.7 vs newest v0.77.0 — 62 releases apart, and both vendored
    // files byte-identical. Ref distance is not artifact distance, because these
    // two files change far less often than the repository is tagged. A notice
    // that cries wolf 62 times trains the reader to skip the one time it matters,
    // which is the same asymmetry that makes a guardrail unable to go red: a
    // signal nobody reads is indistinguishable from one that never fires. So
    // compare the bytes the lock already records, and say which case this is.
    const drifted = await changedFilesAt(latest, lock);
    if (drifted === null) {
      process.stdout.write(
        `\nNotice: pinned at ${lock.ref}; newest release is ${latest}.\n` +
          `Could not compare content at ${latest}; treating as no signal.\n`,
      );
    } else if (drifted.length === 0) {
      process.stdout.write(
        `\nNotice: pinned at ${lock.ref}; newest release is ${latest}, ` +
          `but all ${entries.length} vendored file(s) are byte-identical there.\n` +
          `No action needed — refreshing the ref would produce no diff.\n`,
      );
    } else {
      process.stdout.write(
        `\nNotice: pinned at ${lock.ref}; newest release is ${latest}, ` +
          `and ${drifted.length} vendored file(s) differ there:\n` +
          drifted.map((f) => `  ${f}\n`).join('') +
          `This is not a failure. Update deliberately when you choose to:\n` +
          `  node scripts/vendor-configs.mjs ${latest}\n`,
      );
    }
  }
}

/**
 * Vendored `.js` files that use ESM syntax but sit in a directory with no
 * `{"type":"module"}` marker.
 *
 * This is deliberately outside the SHA-256 drift check, because it asks a
 * question hashes cannot: every byte can match the lock, every file can be
 * individually correct, and the directory still not be a loadable package.
 *
 * The window is real rather than theoretical. Node enabled module syntax
 * detection by default in 22.7.0, but this repo declares
 * `engines.node: ">=22.0.0"` and `.nvmrc: 22`, so 22.0–22.6 are permitted and
 * `import()` fails outright there without the marker. Measured with
 * `--no-experimental-detect-module`: import succeeds with the marker and fails
 * with `ERR_REQUIRE_CYCLE_MODULE` without it.
 *
 * Nothing else in the repository would notice. Prettier loads its config
 * through its own resolver, so `format:check` passes either way — the gate
 * stays green while the file is unimportable.
 *
 * `.mjs` is skipped: its extension already declares the module system.
 */
async function missingModuleMarkers(files) {
  const offenders = [];
  for (const [dest, text] of files) {
    if (!dest.endsWith('.js')) continue;
    if (!/^\s*(export\s+(default|const|function|class|\{)|import\s)/m.test(text)) continue;
    const marker = join(dirname(dest), 'package.json');
    let declared;
    try {
      declared = JSON.parse(await readFile(marker, 'utf8')).type;
    } catch {
      offenders.push(`${dest}: no ${marker}`);
      continue;
    }
    if (declared !== 'module') {
      offenders.push(`${dest}: ${marker} declares type '${declared ?? 'commonjs'}', not 'module'`);
    }
  }
  return offenders;
}

/**
 * Which vendored files actually differ at `ref`, by the same SHA-256 the lock
 * records. Returns null if any fetch fails, so an offline runner reports "no
 * signal" rather than a wrong answer in either direction.
 */
async function changedFilesAt(ref, lock) {
  const changed = [];
  for (const [dest, entry] of Object.entries(lock.files)) {
    let text;
    try {
      text = await fetchFile(ref, entry.source);
    } catch {
      return null;
    }
    if (text === null || text === undefined) return null;
    if (sha256(text) !== entry.sha256) changed.push(dest);
  }
  return changed;
}

/**
 * A fetch can fail in three ways and only the first is obvious. A non-200 is
 * loud. An empty 200 is quiet. A 200 carrying the wrong bytes — an HTML error
 * page, a redirect landing page, an LFS pointer — is silent, and it is the one
 * that leaves a file on disk that tools then "successfully" read as empty
 * configuration. All three are fatal here.
 */
function assertPayload(path, text) {
  if (text.trim() === '') {
    fail(`${path} came back empty`, 'The ref may exist but not contain this file.');
  }
  // An executable is a legitimate payload that exports nothing. Keyed on the
  // shebang rather than on a per-set `kind` flag because the drift check fetches
  // by lock entry and has no set to consult — plumbing a kind through would have
  // made every executable throw there, and that path swallows throws and reports
  // "no signal", which would have disabled drift detection for the config files
  // too. No HTML error page begins with `#!`.
  if (text.startsWith('#!')) return;
  if (path.endsWith('.json')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail(
        `${path} is not valid JSON`,
        'This is usually an HTML error page served with status 200.',
      );
    }
    if (!parsed || typeof parsed !== 'object' || !parsed.compilerOptions) {
      fail(
        `${path} has no "compilerOptions"`,
        'It parsed, but it is not a TypeScript configuration.',
      );
    }
  } else if (!/^export /m.test(text)) {
    fail(`${path} exports nothing`, 'It downloaded, but it is not an ES module configuration.');
  }
}

async function fetchFile(ref, path) {
  const url = `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`;
  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    fail(`could not reach ${url}`, String(cause.message ?? cause));
  }
  if (!response.ok) {
    fail(
      `${url} returned HTTP ${response.status}`,
      `Check that ref '${ref}' exists in ${REPO} and contains this path.`,
    );
  }
  const text = await response.text();
  assertPayload(path, text);
  return text;
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.check) {
    if (positional.length > 0) {
      fail('--check takes no ref', 'It verifies the ref already recorded in the lock file.');
    }
    await check();
    return;
  }
  const ref = positional[0];
  if (!ref) {
    fail('a ref is required', 'Pass a tag, not a branch: node scripts/vendor-configs.mjs v1.2.3');
  }
  const dest = flags.dest ?? 'config/engineering';
  const names = (flags.set ?? Object.keys(SETS).join(',')).split(',').map((s) => s.trim());
  for (const name of names) {
    if (!SETS[name]) fail(`unknown set '${name}'`, `Known sets: ${Object.keys(SETS).join(', ')}`);
  }

  // Fetch and validate everything before writing anything. A partial write is
  // worse than a failed one: the tools would run against a mix of refs and
  // report success.
  const staged = [];
  for (const name of names) {
    const { from, files } = SETS[name];
    for (const file of files) {
      const path = `${from}/${file}`;
      const text = await fetchFile(ref, path);
      staged.push({ name, path, file, text, dest: join(dest, name, file) });
    }
  }

  for (const item of staged) {
    await mkdir(dirname(item.dest), { recursive: true });
    await writeFile(item.dest, item.text, 'utf8');
  }

  const lock = {
    repository: REPO,
    ref,
    fetchedAt: new Date().toISOString(),
    refresh: `node scripts/vendor-configs.mjs <newer-ref>`,
    files: Object.fromEntries(
      staged.map((item) => [
        item.dest.split('\\').join('/'),
        { source: item.path, sha256: sha256(item.text) },
      ]),
    ),
  };

  let previous = null;
  try {
    previous = JSON.parse(await readFile(LOCK, 'utf8'));
  } catch {
    // No previous lock: this is a first vendor.
  }

  await writeFile(LOCK, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

  process.stdout.write(`Vendored ${staged.length} file(s) from ${REPO}@${ref} into ${dest}/\n`);
  if (previous && previous.ref !== ref) {
    const changed = staged.filter(
      (item) => previous.files?.[item.dest.split('\\').join('/')]?.sha256 !== sha256(item.text),
    );
    process.stdout.write(
      `Ref moved ${previous.ref} -> ${ref}; ${changed.length} file(s) changed content.\n`,
    );
  }
  process.stdout.write(`Recorded ref and SHA-256 of each file in ${LOCK}. Commit both.\n`);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof VendorError)) throw error;
  process.stderr.write(`error: ${error.message}\n`);
  if (error.hint) process.stderr.write(`       ${error.hint}\n`);
  process.exitCode = 1;
}
