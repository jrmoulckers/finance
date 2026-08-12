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

import { mkdir, writeFile, readFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    // The declarations ship beside the modules they describe. finance imports
    // this config through Prettier's `prettier` key in package.json rather than
    // from TypeScript, so TS7016 cannot occur here and the declarations buy
    // nothing today. They are vendored anyway because the set is upstream's to
    // define: carrying a subset made `--check` compare a different payload than
    // upstream publishes, and that divergence is silent in both directions.
    files: ['index.js', 'index.d.ts', 'svelte.js', 'svelte.d.ts'],
    // These files are ESM, and upstream says so via `"type": "module"` in the
    // package it publishes. Vendoring copies the files and leaves that behind,
    // so in a consumer whose root package.json has no `type` field they are
    // nominally CommonJS and `export default` is a syntax error. Node >=22.7
    // masks it by retrying a failed CJS parse as ESM, so it works while warning.
    //
    // Emitting the marker here rather than hand-maintaining it beside the files
    // is what puts it under the lock: an unhashed marker is invisible to
    // `--check`, which is the whole point of having a lock.
    moduleType: 'module',
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

/** True when a path is readable. Used to tell a dropped lock entry from a deleted file. */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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
    } else if (arg === '--prune') {
      flags.prune = true;
    } else if (arg.startsWith('--')) {
      fail(
        `unknown option ${arg}`,
        'Usage: vendor-configs.mjs <ref> [--dest <dir>] [--set a,b] [--prune] | vendor-configs.mjs --check',
      );
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/** Authenticated when a token is available. Unauthenticated GitHub API calls are
 * limited to 60/hour *per IP*, and Actions runners share IPs, so the anonymous
 * path is rate-limited far more often than it is offline. Measured while writing
 * this: the anonymous call returned 403 with `x-ratelimit-remaining: 0`. */
export function apiHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** Highest semver tag, compared numerically. Deliberately not by publish date:
 * a backport wave releases newest-major first and oldest-major last, so a
 * date sort returns the *oldest* maintained line as the frontier — perfectly
 * anti-correlated rather than noisily wrong, and freshly computed either way. */
export function highestSemver(tags) {
  const parsed = tags
    .map((tag) => ({ tag, parts: /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag) }))
    .filter((entry) => entry.parts !== null)
    .map(({ tag, parts }) => ({ tag, key: parts.slice(1, 4).map(Number) }));
  if (parsed.length === 0) return null;
  return parsed.reduce((best, entry) => {
    for (let i = 0; i < 3; i += 1) {
      if (entry.key[i] !== best.key[i]) return entry.key[i] > best.key[i] ? entry : best;
    }
    return best;
  }).tag;
}

/**
 * Resolve the newest upstream ref, and say how the answer was reached.
 *
 * `releases/latest` does not compute a maximum — it reads a `make_latest` flag a
 * maintainer sets, over the *release* population. Tags pushed without a release
 * are invisible to it. Measured on 2026-08-12: upstream had 172 tags and 143
 * releases, and the highest tag `v0.134.0` had no release, so the declared
 * answer was one release behind the actual frontier. So ask both and prefer the
 * higher, rather than trusting either alone.
 *
 * Never throws and never fails the caller: a tag pushed upstream must not turn
 * an unrelated PR red. But it always returns a `reason` when it cannot answer,
 * because a staleness check that goes quiet is indistinguishable from one that
 * checked and found nothing — and that silence is the failure this had.
 */
export async function latestRef() {
  const read = async (path, pick) => {
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
        headers: apiHeaders(),
      });
      if (!response.ok) {
        const limited = response.headers.get('x-ratelimit-remaining') === '0';
        return {
          value: null,
          reason: limited
            ? `GitHub API rate limit exhausted (HTTP ${response.status}); set GITHUB_TOKEN to raise it`
            : `GitHub API returned HTTP ${response.status} for ${path}`,
        };
      }
      return { value: pick(await response.json()), reason: null };
    } catch (error) {
      return { value: null, reason: `could not reach the GitHub API (${error.message})` };
    }
  };

  const release = await read('releases/latest', (body) =>
    typeof body.tag_name === 'string' ? body.tag_name : null,
  );
  const tags = await read('tags?per_page=100', (body) =>
    highestSemver(Array.isArray(body) ? body.map((entry) => entry.name) : []),
  );

  const best = highestSemver([release.value, tags.value].filter(Boolean));
  if (best) return { ref: best, reason: null };
  return { ref: null, reason: release.reason ?? tags.reason ?? 'no semver tag or release found' };
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
/** Longest shared directory prefix of a set of lock keys, without a trailing slash. */
function commonDirPrefix(paths) {
  if (paths.length === 0) return '';
  const split = paths.map((path) => path.split('/').slice(0, -1));
  const shared = [];
  for (let i = 0; i < split[0].length; i += 1) {
    const segment = split[0][i];
    if (!split.every((parts) => parts[i] === segment)) break;
    shared.push(segment);
  }
  return shared.join('/');
}

/**
 * Files outside the vendored tree that mention it.
 *
 * A green `--check` means the tree matches the lock — not that the pin is
 * current, and not that anything still reads it. Ported from upstream, which
 * shipped it after jrm-recipes extended the framing. Both self-reference paths
 * are excluded, because either one would let the check vouch for the tree it is
 * auditing: this script carries the default dest as a literal, and the lock
 * records every dest path by construction.
 */
async function wiringReferences(dest) {
  const needle = String(dest).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (needle === '' || needle === '.') return [];

  const selfPath = resolve(fileURLToPath(import.meta.url));
  const selfText = await readFile(selfPath, 'utf8').catch(() => null);

  const SKIP = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.turbo',
    'out',
  ]);
  const EXT = /\.(json|jsonc|js|mjs|cjs|ts|mts|cts|ya?ml|toml)$/i;
  const MAX_BYTES = 512 * 1024;
  const hits = [];

  async function walk(dir, depth) {
    if (depth > 6) return;
    const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      const path = dir === '.' ? item.name : `${dir}/${item.name}`;
      if (item.isDirectory()) {
        if (SKIP.has(item.name)) continue;
        // The vendored tree references itself; only outside references count.
        if (path === needle) continue;
        await walk(path, depth + 1);
      } else if (item.isFile() && EXT.test(item.name)) {
        const text = await readFile(path, 'utf8').catch(() => null);
        if (text === null) continue;
        const isSelf = selfText === null ? resolve(path) === selfPath : text === selfText;
        if (isSelf) continue;
        if (text.length <= MAX_BYTES && text.includes(needle)) hits.push(path);
      }
    }
  }

  await walk('.', 0);
  return hits.filter((path) => path !== LOCK).sort();
}

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

  // Upstream records `dest` in the lock; this fork's lock predates that, so the
  // dest is recovered as the common directory prefix of every locked key. That
  // is exact for a single-dest lock and degrades to a shorter prefix rather than
  // a wrong one if a second dest is ever added.
  const destPrefix = commonDirPrefix(entries.map(([dest]) => dest));
  const wired = await wiringReferences(destPrefix);
  if (wired.length === 0) {
    fail(
      `nothing outside ${destPrefix}/ references it.`,
      'A green --check would keep saying the tree matches a lock nothing reads. ' +
        'Restore the reference, or drop the set with --prune and delete the files.',
    );
  }

  const { ref: latest, reason: staleReason } = await latestRef();
  if (staleReason) {
    // Naming the gap is the whole point. A silent skip prints the same green
    // line as a successful check, so "matches the lock" reads as "and is
    // current" -- a claim this never made and, on a rate-limited runner, could
    // not have made. Still not fatal: an unreachable API is not a defect here.
    process.stdout.write(
      `\nStaleness not checked: ${staleReason}.\n` +
        `This says nothing about whether ${lock.ref} is current.\n`,
    );
  }
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
    // A derived entry has no upstream file to fetch — its source key carries a
    // `#fragment`. Fetching it verbatim would 404, and the caller reads a failed
    // fetch as "no signal", so a single derived entry would silently disable
    // staleness reporting for every other file in the lock.
    const [sourcePath, derivedFrom] = entry.source.split('#');
    let text;
    try {
      text = await fetchFile(ref, sourcePath);
    } catch {
      return null;
    }
    if (text === null || text === undefined) return null;
    if (derivedFrom === 'type') {
      // The marker mirrors one field of upstream's manifest, so it is stale
      // exactly when that field changes — not when the manifest changes.
      let declared;
      try {
        declared = JSON.parse(text).type;
      } catch {
        return null;
      }
      if (sha256(`${JSON.stringify({ type: declared }, null, 2)}\n`) !== entry.sha256) {
        changed.push(dest);
      }
      continue;
    }
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
    if (!parsed || typeof parsed !== 'object') {
      fail(`${path} is not a JSON object`, 'It parsed, but it is not a configuration file.');
    }
    // A package manifest is fetched to read its declared module type, not to be
    // vendored as a config. Requiring `compilerOptions` of every .json assumed
    // the only JSON upstream serves is a tsconfig, which stopped being true the
    // moment the module-type marker needed verifying. Parsing still guards the
    // HTML-error-page case, which is what this function exists for.
    if (basename(path) !== 'package.json' && !parsed.compilerOptions) {
      fail(
        `${path} has no "compilerOptions"`,
        'It parsed, but it is not a TypeScript configuration.',
      );
    }
  } else if (!/^export /m.test(text)) {
    fail(`${path} exports nothing`, 'It downloaded, but it is not an ES module configuration.');
  }
}

async function fetchFile(ref, path, required = true) {
  const url = `https://raw.githubusercontent.com/${REPO}/${ref}/${path}`;
  let response;
  try {
    response = await fetch(url);
  } catch (cause) {
    if (!required) return null;
    fail(`could not reach ${url}`, String(cause.message ?? cause));
  }
  if (!response.ok) {
    if (!required) return null;
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
    const { from, files, moduleType } = SETS[name];
    for (const file of files) {
      const path = `${from}/${file}`;
      const text = await fetchFile(ref, path);
      staged.push({ name, path, file, text, dest: join(dest, name, file) });
    }
    if (moduleType) {
      // `moduleType` is a literal, and literals silently diverge from the thing
      // they claim to mirror. Verify it against the ref rather than trusting it:
      // a marker stating the WRONG type is worse than no marker at all, because
      // an explicit type overrides Node's own CJS/ESM detection fallback and
      // converts a runtime that would have coped into one that cannot.
      const manifest = await fetchFile(ref, `${from}/package.json`, false);
      if (manifest === null) {
        process.stderr.write(
          `\nwarning: could not read ${from}/package.json at ${ref}.\n` +
            `Emitting "type": "${moduleType}" unverified.\n`,
        );
      } else {
        let declared;
        try {
          declared = JSON.parse(manifest).type;
        } catch {
          declared = undefined;
        }
        if (declared !== moduleType) {
          fail(
            `${from} declares type '${declared ?? 'none'}' at ${ref}, but this script emits '${moduleType}'`,
            'Upstream changed its module type. Update SETS to match before vendoring.',
          );
        }
      }
      staged.push({
        name,
        // Derived from upstream's package.json rather than copied from it, so it
        // carries a distinct source key. Staged like any other file so the lock
        // covers it — a marker outside the lock is the unhashed workaround this
        // replaces, and `--check` would report it clean forever.
        path: `${from}/package.json#type`,
        file: 'package.json',
        text: `${JSON.stringify({ type: moduleType }, null, 2)}\n`,
        dest: join(dest, name, 'package.json'),
      });
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

  // A partial `--set` rewrites the whole lock, so any previously locked file
  // outside the chosen sets drops out of it while staying on disk. `--check`
  // then passes over a tree it no longer covers, which is the unhashed-file
  // hazard the lock exists to remove — and it happens silently, because
  // dropping an entry looks identical to never having had one.
  //
  // Reported rather than repaired: carrying the old entries forward would put
  // two refs in one lock, and a lock that cannot name a single ref cannot
  // answer the question `--check` asks.
  const droppedFromLock = [];
  for (const key of Object.keys(previous?.files ?? {})) {
    if (lock.files[key]) continue;
    if (await exists(key)) droppedFromLock.push(key);
  }
  if (droppedFromLock.length > 0 && !flags.prune) {
    fail(
      `vendoring only [${names.join(', ')}] would drop ${droppedFromLock.length} locked file(s) that are still on disk:\n` +
        droppedFromLock.map((key) => `  - ${key}`).join('\n'),
      'Re-run with every set the lock covers, or pass --prune to drop them deliberately (and delete the files).',
    );
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

// Guarded so the module can be imported without running the tool. Without this
// it had one export and no tests, not because it was untestable but because
// importing it executed a network-touching CLI.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof VendorError)) throw error;
    process.stderr.write(`error: ${error.message}\n`);
    if (error.hint) process.stderr.write(`       ${error.hint}\n`);
    process.exitCode = 1;
  }
}
