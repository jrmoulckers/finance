/**
 * Base Prettier configuration.
 *
 * Reconciled from the configurations in use across the product repositories.
 * Two values are deliberate corrections rather than a majority vote:
 *
 * - `endOfLine: 'lf'` — one repository used `auto`, which lets CRLF enter a
 *   tracked file on Windows. LF is the only value consistent with the
 *   repository's enforced line-ending check.
 * - `semi: true` — stated explicitly rather than left to the default so the
 *   value survives a Prettier major-version change.
 *
 * @type {import('prettier').Config}
 */
export const config = {
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  arrowParens: 'always',
  endOfLine: 'lf',
  overrides: [
    {
      files: '*.md',
      // `proseWrap: 'preserve'`, not 'always'. Hard wrapping was the original
      // choice because unbounded prose lines are unpleasant to review, but it
      // collapses author line breaks — measured: four sentence-per-line lines
      // become three filled ones. That makes semantic line breaks impossible
      // to keep, and those are what actually deliver bounded lines, one-line
      // diffs per edited sentence, and conflict-free concurrent edits.
      // 'preserve' permits the better technique instead of overwriting it.
      options: { proseWrap: 'preserve', printWidth: 96 },
    },
  ],
};

export default config;
