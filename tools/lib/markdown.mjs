/**
 * Shared markdown scanning primitives (#4315).
 *
 * Every tool in this repository that reads markdown for a pattern eventually discovers that a
 * fenced code block is an *illustration*, not an assertion, and that counting it makes the tool
 * fail on the prose documenting the tool. That discovery has happened three separate times here:
 *
 * - `check-doc-links.mjs` grew {@link markFences}, exported and tested, after a fence-blind census
 *   reported an elided example as a broken link.
 * - `check-upstream-refs.mjs` grew its own inline copy, with a comment recording that "counting
 *   them made the check fail on the prose that documents the check."
 * - `check-citation-enumerations.mjs`, a required gate, never grew one, and false-accuses a fenced
 *   illustration of the very violation it exists to describe.
 *
 * The guard was exported and had **zero external importers**, so being reusable did no work. A
 * shared primitive is not the one that could be imported; it is the one that is. This module makes
 * the guard the path of least resistance rather than a thing each tool rediscovers after being
 * bitten by it.
 *
 * Fence semantics are markdown's, so callers scanning other extensions must opt out: a triple
 * backtick in a `.mjs` file is inside a comment, not a delimiter.
 */

/** Opening or closing delimiter of a fenced code block. */
export const FENCE = /^\s*(?:```|~~~)/;

/**
 * Split a document into lines, marking which are inside a fenced code block.
 *
 * The delimiter lines themselves are marked fenced, so a caller can skip on the flag alone without
 * separately recognising the fence. An unterminated fence leaves the remainder of the document
 * fenced, which is what a markdown renderer does and therefore what a reader sees.
 *
 * Splits on `/\r?\n/` so a CRLF document does not leave a stray carriage return on every line;
 * indices are unaffected either way.
 *
 * @param {string} text Document contents.
 * @returns {{line: string, fenced: boolean}[]} One entry per line, in order.
 */
export function markFences(text) {
  let fenced = false;
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      if (FENCE.test(line)) {
        fenced = !fenced;
        return { line, fenced: true };
      }
      return { line, fenced };
    });
}

/**
 * The one-based line numbers that sit inside a fenced block.
 *
 * Returned as a `Set` of line numbers rather than a filtered list of lines, because a caller that
 * has already found a hit needs to ask "was line N fenced?" without re-deriving the numbering. A
 * filtered list silently renumbers, which is how an exclusion turns into a wrong citation.
 *
 * @param {string} text Document contents.
 * @returns {Set<number>} One-based line numbers inside fences, including delimiters.
 */
export function fencedLineNumbers(text) {
  const fenced = new Set();
  markFences(text).forEach((entry, index) => {
    if (entry.fenced) fenced.add(index + 1);
  });
  return fenced;
}
