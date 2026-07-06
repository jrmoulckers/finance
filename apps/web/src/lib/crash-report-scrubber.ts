// SPDX-License-Identifier: BUSL-1.1

/**
 * Crash report scrubber — strips sensitive financial data from error payloads.
 *
 * This module builds on the existing `scrubFinancialData` utility in
 * `monitoring.ts` and provides additional helpers specifically for
 * crash reporting controls:
 *
 * - `scrubCrashPayload()` — produces a sanitized crash report object
 * - `generateExamplePayload()` — returns a representative sample report
 *   that users can inspect before opting in
 *
 * Sensitive fields that are ALWAYS stripped:
 * - amounts, balances, totals, prices
 * - payee names, account names, memo/notes
 * - authentication tokens, API keys
 * - email addresses, user names
 *
 * References: issue #1673
 */

import { scrubFinancialData } from './monitoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A sanitized crash report payload. */
export interface CrashReportPayload {
  /** Error type (e.g., "TypeError", "RangeError"). */
  readonly errorType: string;
  /** Scrubbed error message. */
  readonly errorMessage: string;
  /** Stack trace (file paths only, no variable values). */
  readonly stackTrace: string;
  /** Timestamp of the crash. */
  readonly timestamp: string;
  /** App version. */
  readonly appVersion: string;
  /** Browser user agent. */
  readonly userAgent: string;
  /** Current route path (no query parameters). */
  readonly currentRoute: string;
  /** Pseudonymous session identifier. */
  readonly sessionId: string;
  /** Device/viewport metadata. */
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  /** Recent navigation breadcrumbs (scrubbed). */
  readonly breadcrumbs: ReadonlyArray<{
    readonly type: string;
    readonly message: string;
    readonly timestamp: string;
  }>;
}

// ---------------------------------------------------------------------------
// Scrubbing
// ---------------------------------------------------------------------------

/**
 * Scrub a stack trace to remove any embedded variable values.
 *
 * Preserves file paths and line numbers but strips anything that could
 * be a financial value or personal identifier.
 */
export function scrubStackTrace(stack: string): string {
  if (!stack) return '';

  return stack
    .split('\n')
    .map((line) => {
      // Remove any inline values that look like amounts
      let scrubbed = line.replace(
        /[$€£¥₹]\s?\d[\d,]*\.?\d{0,2}|\d[\d,]*\.?\d{0,2}\s?[$€£¥₹]/g,
        '[REDACTED_AMOUNT]',
      );
      // Remove quoted string literals that might contain sensitive data
      scrubbed = scrubbed.replace(/"[^"]{20,}"/g, '"[REDACTED]"');
      scrubbed = scrubbed.replace(/'[^']{20,}'/g, "'[REDACTED]'");
      return scrubbed;
    })
    .join('\n');
}

/**
 * Build a sanitized crash report payload from an Error and optional context.
 *
 * @param error - The caught error.
 * @param context - Optional additional context (will be scrubbed).
 * @returns A CrashReportPayload with all sensitive data removed.
 */
export function scrubCrashPayload(
  error: Error,
  context?: Record<string, unknown>,
): CrashReportPayload {
  const scrubbedContext = context ? scrubFinancialData(context) : {};

  return {
    errorType: error.name || 'Error',
    errorMessage: scrubFinancialData(error.message) as unknown as string,
    stackTrace: scrubStackTrace(error.stack ?? ''),
    timestamp: new Date().toISOString(),
    appVersion: '0.1.0',
    userAgent: navigator.userAgent,
    currentRoute: window.location.pathname,
    sessionId: `session-${crypto.randomUUID().slice(0, 8)}`,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    breadcrumbs: Array.isArray((scrubbedContext as Record<string, unknown>).breadcrumbs)
      ? ((scrubbedContext as Record<string, unknown>)
          .breadcrumbs as CrashReportPayload['breadcrumbs'])
      : [],
  };
}

// ---------------------------------------------------------------------------
// Example payload
// ---------------------------------------------------------------------------

/**
 * Generate an example crash report payload for user inspection.
 *
 * This shows users exactly what data would be sent, with all
 * financial and personal information replaced by redaction markers.
 * The example is static and contains no real user data.
 */
export function generateExamplePayload(): CrashReportPayload {
  return {
    errorType: 'TypeError',
    errorMessage: 'Cannot read properties of undefined (reading "id")',
    stackTrace: [
      'TypeError: Cannot read properties of undefined (reading "id")',
      '    at TransactionList (src/components/transactions/TransactionList.tsx:42:18)',
      '    at renderWithHooks (node_modules/react-dom/cjs/react-dom.development.js:14985:18)',
      '    at mountIndeterminateComponent (node_modules/react-dom/cjs/react-dom.development.js:17811:13)',
    ].join('\n'),
    timestamp: '2025-01-15T10:30:00.000Z',
    appVersion: '0.1.0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    currentRoute: '/transactions',
    sessionId: 'session-a1b2c3d4',
    viewport: {
      width: 1920,
      height: 1080,
    },
    breadcrumbs: [
      {
        type: 'navigation',
        message: 'Navigated to /transactions',
        timestamp: '2025-01-15T10:29:55.000Z',
      },
      {
        type: 'ui',
        message: 'Clicked filter button',
        timestamp: '2025-01-15T10:29:58.000Z',
      },
      {
        type: 'error',
        message: 'Component render failed',
        timestamp: '2025-01-15T10:30:00.000Z',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Field descriptions (for UI display)
// ---------------------------------------------------------------------------

/** Human-readable descriptions of each field in the crash report. */
export const CRASH_REPORT_FIELD_DESCRIPTIONS: Record<string, string> = {
  errorType: 'The JavaScript error type (e.g., TypeError, RangeError)',
  errorMessage: 'A scrubbed description of what went wrong, with no financial data included',
  stackTrace: 'Code file paths and line numbers to help locate the bug, with no variable values',
  timestamp: 'When the error occurred (UTC)',
  appVersion: 'The version of the app you are running',
  userAgent: 'Your browser name and version',
  currentRoute: 'Which page you were on (e.g., /transactions), with no query parameters',
  sessionId: 'A random session ID that cannot be linked back to your account',
  viewport: 'Your browser window size (width × height in pixels)',
  breadcrumbs: 'Recent navigation actions (e.g., "clicked button"), with no financial details',
};

/** Fields that are explicitly NEVER included in crash reports. */
export const NEVER_INCLUDED_FIELDS = [
  'Account names',
  'Account numbers',
  'Transaction amounts',
  'Account balances',
  'Payee / merchant names',
  'Transaction notes or memos',
  'Email addresses',
  'Passwords or tokens',
  'Budget amounts',
  'Goal targets',
] as const;
