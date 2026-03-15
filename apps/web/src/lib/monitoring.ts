// SPDX-License-Identifier: BUSL-1.1

/* eslint-disable no-console */

/**
 * Monitoring and error tracking configuration for the Finance web app (#410).
 *
 * Privacy-first design:
 * - NEVER sends PII (email, name, IP) to error tracking services
 * - NEVER includes financial data (amounts, balances, account names) in reports
 * - NEVER includes authentication tokens or encryption keys
 * - Consent-gated: only initializes when the user has opted in
 * - Uses pseudonymous user IDs only
 *
 * Integration:
 *   Call `initMonitoring()` from `main.tsx` before rendering the app.
 *   Call `setMonitoringUser()` on login with a pseudonymous ID.
 *   Call `clearMonitoringUser()` on logout.
 *
 * Environment Variables:
 *   VITE_SENTRY_DSN         — Sentry project DSN (set in .env, never committed)
 *   VITE_SENTRY_ENVIRONMENT — Environment name (development, staging, production)
 */

// ============================================================================
// Types
// ============================================================================

/** Keys that must be stripped from any error context or breadcrumb data. */
const SENSITIVE_KEYS = new Set([
  'email',
  'name',
  'displayName',
  'display_name',
  'userName',
  'user_name',
  'payee',
  'note',
  'notes',
  'memo',
  'description',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'password',
  'secret',
  'key',
  'apiKey',
  'api_key',
  'dsn',
  'connectionString',
  'connection_string',
  'authorization',
  'cookie',
  'accountName',
  'account_name',
  'accountNumber',
  'account_number',
  'routingNumber',
  'routing_number',
]);

/** Keys whose values represent financial amounts that must be stripped. */
const FINANCIAL_VALUE_KEYS = new Set([
  'amount',
  'amount_cents',
  'amountCents',
  'balance',
  'currentBalance',
  'current_balance',
  'targetAmount',
  'target_amount',
  'currentAmount',
  'current_amount',
  'budgetAmount',
  'budget_amount',
  'startingBalance',
  'starting_balance',
  'total',
  'subtotal',
  'price',
]);

/** Pattern matching currency amounts like $1,234.56, €100.00, £50 */
const CURRENCY_PATTERN =
  /[$€£¥₹]\s?\d[\d,]*\.?\d{0,2}|\d[\d,]*\.?\d{0,2}\s?[$€£¥₹]|\b\d{1,3}(,\d{3})*\.\d{2}\b/g;

/** Pattern matching sequences of 4+ digits that could be account numbers. */
const ACCOUNT_NUMBER_PATTERN = /\b\d{4,}\b/g;

// ============================================================================
// Privacy Scrubbing
// ============================================================================

/**
 * Scrub financial data and PII patterns from an arbitrary object.
 *
 * This function recursively walks the object and:
 * 1. Removes keys that are in the SENSITIVE_KEYS or FINANCIAL_VALUE_KEYS sets
 * 2. Replaces string values matching currency patterns with "[REDACTED]"
 * 3. Replaces string values matching account number patterns with "[REDACTED]"
 *
 * @param obj - The object to scrub (modified in place and returned).
 * @returns The scrubbed object.
 */
export function scrubFinancialData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return scrubString(obj) as unknown as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubFinancialData(item)) as unknown as T;
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // Strip sensitive keys entirely
    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(lowerKey)) {
      scrubbed[key] = '[REDACTED]';
      continue;
    }

    // Strip financial value keys
    if (FINANCIAL_VALUE_KEYS.has(key) || FINANCIAL_VALUE_KEYS.has(lowerKey)) {
      scrubbed[key] = '[REDACTED]';
      continue;
    }

    // Recurse into nested objects
    if (typeof value === 'object' && value !== null) {
      scrubbed[key] = scrubFinancialData(value);
    } else if (typeof value === 'string') {
      scrubbed[key] = scrubString(value);
    } else {
      scrubbed[key] = value;
    }
  }

  return scrubbed as unknown as T;
}

/**
 * Scrub sensitive patterns from a string value.
 */
function scrubString(value: string): string {
  let scrubbed = value;
  scrubbed = scrubbed.replace(CURRENCY_PATTERN, '[REDACTED_AMOUNT]');
  scrubbed = scrubbed.replace(ACCOUNT_NUMBER_PATTERN, '[REDACTED_NUMBER]');
  return scrubbed;
}

// ============================================================================
// Monitoring Initialization
// ============================================================================

/** Whether monitoring has been initialized. */
let isInitialized = false;

/**
 * Initialize monitoring and error tracking.
 *
 * Call this once from `main.tsx` before rendering the React app.
 * Initialization is gated on:
 * 1. The VITE_SENTRY_DSN environment variable being set
 * 2. User consent (to be wired when consent UI is implemented, #367)
 *
 * In development mode, errors are logged to the console instead.
 */
export function initMonitoring(): void {
  if (isInitialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  // Will be used when Sentry initialization is uncommented (#367)
  // const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE;

  if (!dsn) {
    if (import.meta.env.DEV) {
      console.info(
        '[Monitoring] Sentry DSN not configured. Error tracking disabled. ' +
          'Set VITE_SENTRY_DSN in .env to enable.',
      );
    }
    isInitialized = true;
    return;
  }

  // TODO (#367): Check user consent before initializing Sentry.
  // Until consent UI is implemented, Sentry initialization is commented out
  // to comply with GDPR requirements. Uncomment when consent flow is ready.
  //
  // import * as Sentry from '@sentry/browser';
  //
  // Sentry.init({
  //   dsn,
  //   environment,
  //
  //   // Privacy: never send default PII (IP address, cookies, user agent)
  //   sendDefaultPii: false,
  //
  //   // Scrub financial data from all events before sending
  //   beforeSend(event) {
  //     return scrubFinancialData(event);
  //   },
  //
  //   // Scrub financial data from breadcrumbs
  //   beforeBreadcrumb(breadcrumb) {
  //     if (breadcrumb.data) {
  //       breadcrumb.data = scrubFinancialData(breadcrumb.data);
  //     }
  //     if (breadcrumb.message) {
  //       breadcrumb.message = scrubString(breadcrumb.message);
  //     }
  //     return breadcrumb;
  //   },
  //
  //   // Filter out noisy third-party errors
  //   denyUrls: [
  //     /extensions\//i,
  //     /^chrome:\/\//i,
  //     /^moz-extension:\/\//i,
  //   ],
  //
  //   // Sample 100% of errors in production, adjust based on volume
  //   sampleRate: 1.0,
  //
  //   // Performance monitoring: sample 10% of transactions
  //   tracesSampleRate: 0.1,
  //
  //   // Integrations
  //   integrations: [
  //     Sentry.browserTracingIntegration(),
  //   ],
  // });

  isInitialized = true;
}

/**
 * Set the current user for error tracking context.
 *
 * @param pseudonymousId - A rotatable, non-reversible user identifier.
 *   MUST be a UUID or hash — NEVER an email, account ID, or real name.
 */
export function setMonitoringUser(pseudonymousId: string): void {
  // TODO: Uncomment when Sentry is initialized
  // import * as Sentry from '@sentry/browser';
  // Sentry.setUser({ id: pseudonymousId });
  if (import.meta.env.DEV) {
    console.debug('[Monitoring] User set:', pseudonymousId);
  }
}

/**
 * Clear the current user context (call on logout).
 */
export function clearMonitoringUser(): void {
  // TODO: Uncomment when Sentry is initialized
  // import * as Sentry from '@sentry/browser';
  // Sentry.setUser(null);
  if (import.meta.env.DEV) {
    console.debug('[Monitoring] User cleared');
  }
}

/**
 * Capture an error manually.
 *
 * Use this for caught exceptions that should be reported but
 * don't crash the app.
 *
 * @param error - The error to report.
 * @param context - Optional diagnostic context (must not contain PII or financial data).
 */
export function captureError(error: Error, context?: Record<string, string>): void {
  // TODO: Uncomment when Sentry is initialized
  // import * as Sentry from '@sentry/browser';
  // Sentry.captureException(error, {
  //   extra: context ? scrubFinancialData(context) : undefined,
  // });
  if (import.meta.env.DEV) {
    console.error('[Monitoring] Captured error:', error.message, context);
  }
}

/**
 * Record a breadcrumb for diagnostic context.
 *
 * Breadcrumbs are attached to subsequent error reports to help
 * reconstruct the sequence of events leading to an error.
 *
 * @param message - Descriptive message (must not contain PII or financial data).
 * @param category - Category for grouping (e.g., "navigation", "sync", "auth").
 * @param data - Optional metadata (will be scrubbed before sending).
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, string>,
): void {
  // TODO: Uncomment when Sentry is initialized
  // import * as Sentry from '@sentry/browser';
  // Sentry.addBreadcrumb({
  //   message: scrubString(message),
  //   category,
  //   data: data ? scrubFinancialData(data) : undefined,
  //   level: 'info',
  // });
  if (import.meta.env.DEV) {
    console.debug(`[Monitoring] Breadcrumb [${category}]:`, message, data);
  }
}
