/**
 * Shared JavaScript-source scanning primitives (#4330).
 *
 * Every tool here that looks for a token in source eventually discovers that the token also appears
 * as *data* -- in a string literal that mentions it, or in prose about the tool. Treating a mention
 * as a claim is the recurring defect of this tree, and of the sibling session's, which reported it
 * three rounds running while shipping a fourth detector without the fix.
 *
 * It had already happened twice here, and the two fixes diverged:
 *
 * - `check-assertion-bounds.mjs` grew this function, exported and escape-aware.
 * - `check-citation-enumerations.mjs` grew `/'[^']*'|"[^"]*"|<backtick>[^<backtick>]*<backtick>/g`
 *   inline, which does not model escapes. Verified by execution, that gap made the hardened
 *   exemption marker of #4321 fail *open*: a literal containing an escaped quote before the marker
 *   granted the exemption from data, which is precisely what #4321 claimed to close.
 * - `check-markdown-primitives.mjs` -- the gate that exists to find duplicated predicates -- needed
 *   stripping and had none, so it read a fence regex inside a string as an implementation.
 *
 * The correct version was exported, in this directory's parent, the whole time. Both the divergence
 * and the fail-open behaviour are consequences of re-deriving a predicate rather than importing it,
 * which is the class `check-markdown-primitives.mjs` was built to detect and did not cover.
 *
 * Padding rather than deleting is deliberate: callers such as `hasExemption` take an `indexOf` on
 * the result and slice the original semantics out of it, so column positions must survive.
 */

/**
 * Blank out the contents of every string literal on a line.
 *
 * Handles single, double, and template delimiters, and backslash escapes within them, so a literal
 * such as `'it\'s'` is consumed whole rather than terminating early and leaking its tail into the
 * returned text. The replacement repeats the opening delimiter to the original length, so the
 * result is the same width as the input and offsets remain comparable to the source line.
 *
 * This does not parse: a template with an interpolation containing a quote, or a regex literal
 * containing an unbalanced quote, can still confuse it. It is a lexical approximation chosen
 * because every caller here needs "is this token code or data", not an AST.
 *
 * @param {string} line Source line.
 * @returns {string} The line with literal contents replaced, preserving length.
 */
export function stripLiterals(line) {
  return line.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, (match) => match[0].repeat(match.length));
}

/**
 * The `[start, end)` offsets of every string literal on a line.
 *
 * Needed because "is this token inside a literal" is not the same question as "blank the literals
 * out", and conflating them broke a detector. `check-markdown-primitives.mjs` recognises
 * `line.startsWith('<fence>')` as a fence predicate, and that predicate's *evidence is a string
 * literal* -- the delimiter can only appear as an argument. Stripping first therefore erased the
 * construct the census exists to find, while correctly erasing a whole predicate quoted inside an
 * outer literal.
 *
 * The distinguishing property is nesting, not presence: a match is data when the match *begins*
 * inside a literal, and code when it begins outside one, regardless of what it contains.
 *
 * @param {string} line Source line.
 * @returns {[number, number][]} Ascending, non-overlapping offsets.
 */
export function literalSpans(line) {
  const text = String(line);
  const spans = [];
  let i = 0;
  let start = -1;
  let delim = '';
  let regex = false;
  while (i < text.length) {
    const ch = text[i];
    if (start === -1) {
      if (ch === "'" || ch === '"' || ch === '`') {
        start = i;
        delim = ch;
        regex = false;
      } else if (ch === '/' && text[i + 1] === '/') {
        // A line comment. Everything after it is prose, so it is data to every caller here.
        spans.push([i, text.length]);
        return spans;
      } else if (ch === '/' && looksLikeRegexStart(text, i)) {
        start = i;
        delim = '/';
        regex = true;
      }
      i += 1;
      continue;
    }
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (regex && ch === '[') {
      // A character class may contain an unescaped `/`, which would otherwise close the literal.
      const close = text.indexOf(']', i + 1);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    if (ch === delim) {
      // Regex literals are code, not data: their contents are the implementation. They are tracked
      // only so that quote characters inside them do not open a spurious string span, which made
      // the literal-stripping signatures -- which are themselves about quotes -- undetectable.
      if (!regex) spans.push([start, i + 1]);
      start = -1;
      delim = '';
      regex = false;
    }
    i += 1;
  }
  return spans;
}

/**
 * Whether a `/` at `index` opens a regex literal rather than being division or a path separator.
 *
 * Decided by the previous significant character: a regex may only appear where a value may begin.
 * This is the standard lexical heuristic and it is a heuristic -- `a /b/ c` is ambiguous to any
 * scanner without a parser. Recorded rather than hidden, because a caller who believes this is
 * exact will eventually be surprised by one.
 *
 * @param {string} text The line.
 * @param {number} index Offset of the candidate `/`.
 * @returns {boolean} Whether to treat it as a regex opener.
 */
function looksLikeRegexStart(text, index) {
  const before = text.slice(0, index).replace(/\s+$/, '');
  if (before === '') return true;
  return /[(,=:[!&|?{};+\-*%~^<>]$/.test(before) || /\breturn$/.test(before);
}

/**
 * Whole-file spans that are not executable code: strings, comments, and regex literals.
 *
 * Distinct from {@link literalSpans}, which takes a **single line** and deliberately omits regex
 * spans because its callers ask "is this quote character data?" and a regex body is implementation.
 * A caller asking "is this token a call site?" needs the opposite: a `statSync(` written inside a
 * regex, a block comment, or a docstring is a description of a call, not a call.
 *
 * Block comments are the reason this exists. `literalSpans` returns on `//` and tracks nothing
 * across lines, so a docstring line containing `statSync(x).isDirectory()` reads as code to every
 * line-wise caller. The first run of `check-walk-safety` flagged its own docstring three times,
 * which is the cheapest possible demonstration that a detector for an idiom must not be fooled by
 * prose about the idiom (#4349).
 *
 * @param {string} source Whole file text.
 * @param {{comments?: boolean}} [options] `comments: false` masks only literals and regex bodies,
 *   leaving comments visible. Callers asking "is this token a call site?" want comments masked;
 *   callers reading an annotation the author wrote *in* a comment must not, or the annotation
 *   disappears along with the prose. Both questions are legitimate and they are not the same
 *   question, which is the distinction this file already draws between the two span functions.
 * @returns {[number, number][]} Ascending, non-overlapping offsets.
 */
export function maskedSpans(source, options = {}) {
  const { comments = true } = options;
  const text = String(source);
  const spans = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      if (comments) spans.push([i, end]);
      i = end;
      continue;
    }
    if (ch === '/' && next === '/') {
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      if (comments) spans.push([i, end]);
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = closeDelimited(text, i, ch, false);
      spans.push([i, end]);
      i = end;
      continue;
    }
    if (ch === '/' && opensRegex(text, i)) {
      const end = closeDelimited(text, i, '/', true);
      spans.push([i, end]);
      i = end;
      continue;
    }
    i += 1;
  }
  return spans;
}

/**
 * Offset just past the closing delimiter of a literal opening at `start`.
 *
 * @param {string} text Whole file text.
 * @param {number} start Offset of the opening delimiter.
 * @param {string} delim Closing delimiter.
 * @param {boolean} regex Whether character classes must be skipped.
 * @returns {number} Offset just past the close, or the end of input.
 */
function closeDelimited(text, start, delim, regex) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (regex && ch === '[') {
      const close = text.indexOf(']', i + 1);
      i = close === -1 ? text.length : close + 1;
      continue;
    }
    // An unterminated string does not run to the end of the file; it ends at the newline. Without
    // this, one stray apostrophe in a comment would mask the remainder of the file from every
    // caller, turning a detector silently into a no-op.
    if (!regex && delim !== '`' && ch === '\n') return i;
    if (ch === delim) return i + 1;
    i += 1;
  }
  return text.length;
}

/**
 * Whether a `/` at `index` opens a regex literal, scanning a whole file rather than a line.
 *
 * @param {string} text Whole file text.
 * @param {number} index Offset of the candidate `/`.
 * @returns {boolean} Whether to treat it as a regex opener.
 */
function opensRegex(text, index) {
  const before = text.slice(0, index).replace(/\s+$/, '');
  if (before === '') return true;
  return /[(,=:[!&|?{};+\-*%~^<>]$/.test(before) || /\breturn$/.test(before);
}

/**
 * True when `index` falls strictly within one of `spans`.
 *
 * The opening delimiter is treated as outside, so a match that starts at the quote itself -- an
 * expression *about* a literal rather than one nested in it -- is still code.
 *
 * @param {[number, number][]} spans Output of {@link literalSpans}.
 * @param {number} index Offset into the same line.
 * @returns {boolean} Whether the offset is literal content.
 */
export function insideLiteral(spans, index) {
  return spans.some(([start, end]) => index > start && index < end);
}

/**
 * The source with masked spans blanked, preserving every offset and line break.
 *
 * Line-wise callers get whole-file correctness without changing shape: split the result and the
 * line numbers still line up with the original, so a report can quote the untouched line while the
 * detection runs against the masked one.
 *
 * The line-wise alternative is what this replaces. `stripLiterals` sees one line at a time, so a
 * marker sitting inside a multi-line template literal is on a line with no quote on it and survives
 * untouched -- which let a file excuse a real bound with text it never wrote as an annotation
 * (#4353).
 *
 * @param {string} source Whole file text.
 * @param {{comments?: boolean}} [options] Passed to {@link maskedSpans}.
 * @returns {string} Same length as the input.
 */
export function maskSource(source, options = {}) {
  const text = String(source);
  const chars = [...text];
  for (const [start, end] of maskedSpans(text, options)) {
    for (let i = start; i < end && i < chars.length; i += 1) {
      if (chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}
