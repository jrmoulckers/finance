// SPDX-License-Identifier: BUSL-1.1

/**
 * Financial data import and reconciliation engine.
 *
 * Provides parsers for CSV, OFX/QFX, QIF, and PDF text formats,
 * a transaction reconciliation engine with fuzzy matching, delta
 * detection, and import session management for historical migration.
 *
 * @module import
 */

// Types
export type {
  AmountConvention,
  CsvImportOptions,
  FieldMapping,
  FormatDetectionResult,
  ImportError,
  ImportErrorSeverity,
  ImportResult,
  ParsedTransaction,
  RoundingResult,
} from './types';
export { ImportFormat } from './types';

// Format detection
export { detectAllFormats, detectFormat } from './detect';

// CSV parser
export {
  detectDateFormat,
  parseCsvTransactions,
  parseCurrencyToCents,
  parseDate,
} from './csv-parser';

// OFX/QFX parser
export {
  extractBlocks,
  extractTagValue,
  parseOfx,
  parseOfxAmount,
  parseOfxDate,
} from './ofx-parser';

// QIF parser
export type { QifRecord, QifType } from './qif-parser';
export {
  extractCategory,
  parseQif,
  parseQifAmount,
  parseQifDate,
  parseQifRecords,
} from './qif-parser';

// PDF text parser
export type { PdfExtractionConfig, StatementInfo } from './pdf-parser';
export { COMMON_PATTERNS, detectPdfPattern, detectStatementInfo, parsePdfText } from './pdf-parser';

// Receipt OCR parser and web adapter
export type {
  ExtractedReceiptLineItem,
  ExtractedReceiptText,
  ReceiptCategoryOption,
} from './receipt-parser';
export { parseReceiptText, suggestReceiptCategory } from './receipt-parser';
export { TesseractReceiptOcrAdapter, webReceiptOcrAdapter } from './receipt-ocr';
export type { ReceiptOcrAdapter } from './receipt-ocr';

// Reconciliation
export type {
  DuplicateCandidate,
  ExistingTransaction,
  MatchConfidence,
  ReconciliationOptions,
  ReconciliationReport,
  ReconciliationSummary,
  TransactionMatch,
  UnmatchedTransaction,
} from './reconciliation';
export { computeMatchConfidence, reconcile } from './reconciliation';

// Delta detection
export type { DeltaEntry, DeltaReport, DeltaSummary, DeltaStatus } from './delta';
export { computeDelta } from './delta';

// Migration / Import sessions
export type {
  DuplicateCheckResult,
  ImportProgress,
  ImportSession,
  ImportSessionConfig,
  ImportSessionId,
  ImportSessionStatus,
  MergeStrategy,
} from './migration';
export {
  applyMergeStrategy,
  checkDuplicates,
  computeProgress,
  createImportSession,
  prepareRollback,
  updateSessionProgress,
} from './migration';

// Utilities
export { bankersRound, daysBetween, levenshteinDistance, stringSimilarity } from './utils';

// ---------------------------------------------------------------------------
// Backward-compatible re-exports from existing parsers (#1602)
// ---------------------------------------------------------------------------

export { isMintFormat, parseMint } from './mint-parser';
export type { MintParseResult, MintTransaction } from './mint-parser';

export { isYnabFormat, parseYnab } from './ynab-parser';
export type { YnabParseResult, YnabTransaction } from './ynab-parser';

export {
  detectDuplicates,
  detectFormat as detectFormatLegacy,
  parseImportFile,
} from './format-detector';
export type {
  ImportFormat as LegacyImportFormat,
  NormalisedTransaction,
  UniversalImportResult,
} from './format-detector';
