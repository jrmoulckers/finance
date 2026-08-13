/**
 * Resolution context for the vendored citation checker.
 *
 * The vendored checker (config/engineering/citations/check-citations.mjs) prints its
 * version and the index URL it resolved against on the passing path only. On the failing
 * path it prints the unknown IDs and nothing else, so an unknown-ID failure is ambiguous
 * between "the ID is wrong" and "the index this repository resolves against is stale".
 *
 * That second reading is not hypothetical here: the checker is vendored at a pinned
 * release, and the index URL points at a branch, so the authority can change with no diff
 * in this repository. A control that omits its resolution source on failure cannot
 * implicate itself, and it is one of the two suspects every time.
 *
 * These helpers are deliberately separate from the vendored file, which must not diverge
 * from upstream. See ENG-OBS-004.
 */

/** Raw-content URL shape: raw.githubusercontent.com/{owner}/{repo}/{ref}/{path} */
const RAW_URL = /https:\/\/raw\.githubusercontent\.com\/[^\s'"`]+/g;

const SHA40 = /^[0-9a-f]{40}$/;

/**
 * Extract the single index URL literal from the vendored checker's source.
 *
 * Scraping a source file for a constant is reading a name, so this refuses to guess:
 * it reports how many candidates it saw and returns a URL only when there is exactly
 * one. Zero or many is an instrument fault, not a missing value.
 *
 * @param {string} source Text of the vendored checker.
 * @returns {{ url: string | null, matches: number }}
 */
export function extractIndexUrl(source) {
  RAW_URL.lastIndex = 0;
  const found = [...new Set(String(source).match(RAW_URL) ?? [])];
  return { url: found.length === 1 ? found[0] : null, matches: found.length };
}

/**
 * Classify the ref embedded in a raw-content URL.
 *
 * A 40-character hex ref names one immutable commit. Anything else is a branch or tag
 * that can move, which means the resolved index can change without a diff here.
 *
 * @param {string | null} url
 * @returns {{ ref: string | null, mutable: boolean }}
 */
export function refMutability(url) {
  if (!url) return { ref: null, mutable: true };
  //  0       1  2                         3     4    5    6+
  // 'https:' '' raw.githubusercontent.com owner repo ref ...path
  const segments = String(url).split('/');
  const ref = segments[5] ?? null;
  if (!ref) return { ref: null, mutable: true };
  return { ref, mutable: !SHA40.test(ref) };
}

/**
 * Build the lines appended to the checker's failing output.
 *
 * Every line states something that was looked up, and the mutable-ref warning is emitted
 * only when the ref actually is mutable, so a repository that later pins the index by SHA
 * stops being told about a problem it no longer has.
 *
 * @param {{ version: string | null, url: string | null, matches: number, pin: string | null }} input
 * @returns {string[]}
 */
export function contextLines({ version, url, matches, pin }) {
  const lines = [];
  lines.push(
    'Before treating this as a bad ID, note what it was resolved against — a stale index reads the same way.',
  );
  lines.push(
    `  checker: v${version ?? 'unknown'} (asked via --version), vendored at ${pin ?? 'an unrecorded pin'}`,
  );

  if (url) {
    lines.push(`  index:   ${url}`);
    const { ref, mutable } = refMutability(url);
    if (mutable) {
      lines.push(
        `  This index is read from "${ref}", which moves. The set of valid IDs can change with no diff here.`,
      );
    }
  } else {
    lines.push(
      `  index:   not determined — ${matches} URL candidate(s) in the vendored checker, expected exactly 1.`,
    );
  }

  lines.push(
    '  Run `npm run eng:vendor:check` to see whether a newer checker and index are published.',
  );
  return lines;
}
