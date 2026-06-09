// SPDX-License-Identifier: BUSL-1.1

/* eslint-disable no-console */

/**
 * Monitoring and error tracking configuration for the Finance web app (#410, #2033).
 *
 * Privacy-first design:
 * - Consent-gated: only initializes when the user has opted in
 * - DSN-gated: missing Sentry config is a no-op with a single info log
 * - Sentry beforeSend strips PII, auth material, and financial values
 * - Uses pseudonymous user IDs only
 */

import * as Sentry from '@sentry/react';
import type { Event } from '@sentry/react';

/** Keys that must be stripped from Sentry event payloads. */
const SENTRY_SENSITIVE_KEYS = new Set(
  [
    'email',
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'accountNumber',
    'routingNumber',
    'iban',
    'balance',
    'amount',
    'pan',
  ].map((key) => key.toLowerCase()),
);

/** Keys that must be stripped from any local diagnostic context. */
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
  'iban',
  'pan',
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

/** Pattern matching currency amounts like $1,234.56, €100.00, £50. */
const CURRENCY_PATTERN =
  /[$€£¥₹]\s?\d[\d,]*\.?\d{0,2}|\d[\d,]*\.?\d{0,2}\s?[$€£¥₹]|\b\d{1,3}(,\d{3})*\.\d{2}\b/g;

/** Pattern matching sequences of 4+ digits that could be account numbers. */
const ACCOUNT_NUMBER_PATTERN = /\b\d{4,}\b/g;

const SCRUBBED_VALUE = '[scrubbed]';

/** Storage key for the user's optional monitoring consent preference. */
const MONITORING_CONSENT_KEY = 'finance-monitoring-consent';

/** Whether monitoring has been initialized with Sentry. */
let isInitialized = false;

/** Ensures missing DSN no-op logging happens once per browser session. */
let missingDsnLogged = false;

/**
 * Determine whether the user has opted in to anonymous error reporting.
 *
 * @returns True when monitoring consent is enabled in local storage.
 */
function hasMonitoringConsent(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(MONITORING_CONSENT_KEY) === 'true';
}

/**
 * Scrub Sentry-specific sensitive fields from an arbitrary payload.
 *
 * Sentry events are plain JSON-like objects, so this returns a scrubbed copy
 * without mutating the original event passed to beforeSend.
 */
export function scrubSensitiveMonitoringPayload<T>(payload: T): T {
  return scrubSensitiveFields(payload, new WeakSet<object>()) as T;
}

function scrubSensitiveFields(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveFields(item, seen));
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (SENTRY_SENSITIVE_KEYS.has(key.toLowerCase())) {
      scrubbed[key] = SCRUBBED_VALUE;
      continue;
    }

    scrubbed[key] = scrubSensitiveFields(nestedValue, seen);
  }

  return scrubbed;
}

/** Sentry beforeSend hook that strips PII and financial data before upload. */
export function scrubSentryEvent<T extends Event>(event: T): T {
  return scrubSensitiveMonitoringPayload(event);
}

/**
 * Scrub financial data and PII patterns from an arbitrary object.
 *
 * This legacy local scrubber is still used by opt-in preview UI helpers.
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

    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(lowerKey)) {
      scrubbed[key] = '[REDACTED]';
      continue;
    }

    if (FINANCIAL_VALUE_KEYS.has(key) || FINANCIAL_VALUE_KEYS.has(lowerKey)) {
      scrubbed[key] = '[REDACTED]';
      continue;
    }

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

/** Scrub sensitive patterns from a string value. */
function scrubString(value: string): string {
  let scrubbed = value;
  scrubbed = scrubbed.replace(CURRENCY_PATTERN, '[REDACTED_AMOUNT]');
  scrubbed = scrubbed.replace(ACCOUNT_NUMBER_PATTERN, '[REDACTED_NUMBER]');
  return scrubbed;
}

/**
 * Initialize monitoring and error tracking.
 *
 * Call this once from `main.tsx` before rendering the React app. Initialization
 * runs only after the user has explicitly opted in and Sentry is configured.
 */
export function initMonitoring(): void {
  if (isInitialized || !hasMonitoringConsent()) {
    return;
  }

  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) {
    if (!missingDsnLogged) {
      console.info('[Monitoring] Sentry DSN is not configured; error tracking is disabled.');
      missingDsnLogged = true;
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
  });

  isInitialized = true;

  void import('./web-vitals').then(({ observeWebVitals }) => {
    observeWebVitals((metric) => {
      addBreadcrumb(`${metric.name}: ${metric.value} (${metric.rating})`, 'web-vital');
    });
  });
}

/**
 * Set the current user for error tracking context.
 *
 * @param pseudonymousId - A rotatable, non-reversible user identifier.
 *   MUST be a UUID or hash — NEVER an email, account ID, or real name.
 */
export function setMonitoringUser(pseudonymousId: string): void {
  if (!isInitialized || !hasMonitoringConsent()) {
    return;
  }

  Sentry.setUser({ id: pseudonymousId });
}

/** Clear the current user context (call on logout). */
export function clearMonitoringUser(): void {
  if (!isInitialized) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Capture an error manually.
 *
 * Use this for caught exceptions that should be reported but don't crash the app.
 */
export function captureError(error: Error, context?: Record<string, string>): void {
  if (!isInitialized || !hasMonitoringConsent()) {
    return;
  }

  Sentry.captureException(error, {
    extra: context ? scrubSensitiveMonitoringPayload(context) : undefined,
  });
}

/**
 * Record a breadcrumb for diagnostic context.
 *
 * Breadcrumbs are attached to subsequent error reports to help reconstruct the
 * sequence of events leading to an error.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, string>,
): void {
  if (!isInitialized || !hasMonitoringConsent()) {
    return;
  }

  Sentry.addBreadcrumb({
    message: scrubString(message),
    category,
    data: data ? scrubSensitiveMonitoringPayload(data) : undefined,
  });
}
