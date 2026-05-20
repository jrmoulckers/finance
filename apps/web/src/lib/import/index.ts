// SPDX-License-Identifier: BUSL-1.1

/**
 * Universal import format support.
 *
 * Re-exports all import parsers and the format detector for use by
 * the import wizard and data import pages.
 *
 * @module lib/import
 * References: #1602
 */

export { parseOfx, parseQfx } from './ofx-parser';
export type { OfxTransaction, OfxAccount, OfxParseResult } from './ofx-parser';

export { parseQif } from './qif-parser';
export type { QifTransaction, QifAccountType, QifParseResult } from './qif-parser';

export { parseMint, isMintFormat } from './mint-parser';
export type { MintTransaction, MintParseResult } from './mint-parser';

export { parseYnab, isYnabFormat } from './ynab-parser';
export type { YnabTransaction, YnabParseResult } from './ynab-parser';

export { detectFormat, parseImportFile, detectDuplicates } from './format-detector';
export type { ImportFormat, NormalisedTransaction, UniversalImportResult } from './format-detector';
