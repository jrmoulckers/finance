// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser extension for receipt/transaction capture.
 *
 * This directory contains the source files for a Chrome/Edge browser
 * extension (Manifest V3) that allows users to quickly capture receipt
 * and transaction data from any webpage.
 *
 * Files:
 * - manifest.json — Extension manifest (Manifest V3)
 * - popup.html/css/ts — Extension popup UI with receipt capture form
 * - content.ts — Content script for auto-detecting transaction data
 * - background.ts — Service worker for storage management and badge updates
 * - receipt-utils.ts — Shared pure utilities for detection and validation
 *
 * Build:
 * The extension TypeScript files need to be compiled separately from
 * the main Vite build. Use `tsc` to compile to the `dist/extension/` directory.
 *
 * To load in Chrome:
 * 1. Build the extension files
 * 2. Go to chrome://extensions
 * 3. Enable "Developer mode"
 * 4. Click "Load unpacked" and select the dist/extension directory
 */

export {
  detectAmountFromText,
  detectDateFromText,
  extractMerchantFromHostname,
  validateReceiptForm,
  dollarsToCents,
} from './receipt-utils';
export type { DetectedData, ReceiptFormData, ReceiptFormErrors } from './receipt-utils';
