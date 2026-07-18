// SPDX-License-Identifier: BUSL-1.1

/**
 * Consent History — timestamped audit log of all consent changes.
 *
 * Every consent change (grant or withdrawal) is recorded as an immutable
 * event. This provides GDPR-compliant proof of consent with timestamps
 * and supports the consent history viewer in the Privacy Dashboard.
 *
 * Storage: localStorage (same as consent-storage.ts — no server needed).
 *
 * References: issue #1641 (granular consent management with proof)
 */

import type { ConsentCategory } from './consent-storage';
import { safeRandomUUID } from '../utils/uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single consent change event. */
export interface ConsentEvent {
  /** Unique event ID. */
  readonly id: string;
  /** ISO-8601 timestamp of the change. */
  readonly timestamp: string;
  /** Which category was changed. */
  readonly category: ConsentCategory;
  /** The new value (true = granted, false = withdrawn). */
  readonly granted: boolean;
  /** How the change was made. */
  readonly method: 'first_run' | 'settings' | 'banner' | 'dashboard' | 'bulk';
  /** Privacy policy version at the time of the change. */
  readonly policyVersion: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for consent history. */
const CONSENT_HISTORY_KEY = 'finance-consent-history';

/** Maximum history entries to retain (prevents unbounded growth). */
const MAX_HISTORY_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Storage functions
// ---------------------------------------------------------------------------

/**
 * Load the full consent history from localStorage.
 *
 * Returns an empty array if no history exists or parsing fails.
 */
export function loadConsentHistory(): ConsentEvent[] {
  try {
    const raw = localStorage.getItem(CONSENT_HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    // Validate each entry has required fields
    return parsed.filter(
      (e: unknown): e is ConsentEvent =>
        typeof e === 'object' &&
        e !== null &&
        'id' in e &&
        'timestamp' in e &&
        'category' in e &&
        'granted' in e,
    );
  } catch {
    return [];
  }
}

/**
 * Record a consent change event.
 *
 * Appends to the history log and trims if it exceeds the maximum size.
 */
export function recordConsentChange(
  category: ConsentCategory,
  granted: boolean,
  method: ConsentEvent['method'],
  policyVersion: string,
): ConsentEvent {
  const event: ConsentEvent = {
    id: safeRandomUUID(),
    timestamp: new Date().toISOString(),
    category,
    granted,
    method,
    policyVersion,
  };

  const history = loadConsentHistory();
  history.push(event);

  // Trim oldest entries if over the limit
  const trimmed =
    history.length > MAX_HISTORY_ENTRIES ? history.slice(-MAX_HISTORY_ENTRIES) : history;

  localStorage.setItem(CONSENT_HISTORY_KEY, JSON.stringify(trimmed));
  return event;
}

/**
 * Record multiple consent changes at once (e.g., "Accept All" or "Reject All").
 */
export function recordBulkConsentChanges(
  changes: ReadonlyArray<{ category: ConsentCategory; granted: boolean }>,
  method: ConsentEvent['method'],
  policyVersion: string,
): ConsentEvent[] {
  const now = new Date().toISOString();
  const events: ConsentEvent[] = changes.map((change) => ({
    id: safeRandomUUID(),
    timestamp: now,
    category: change.category,
    granted: change.granted,
    method,
    policyVersion,
  }));

  const history = loadConsentHistory();
  history.push(...events);

  const trimmed =
    history.length > MAX_HISTORY_ENTRIES ? history.slice(-MAX_HISTORY_ENTRIES) : history;

  localStorage.setItem(CONSENT_HISTORY_KEY, JSON.stringify(trimmed));
  return events;
}

/**
 * Export consent history as a formatted JSON string for GDPR data portability.
 */
export function exportConsentHistory(): string {
  const history = loadConsentHistory();
  return JSON.stringify(
    {
      type: 'gdpr_consent_history',
      exportedAt: new Date().toISOString(),
      totalEvents: history.length,
      events: history,
    },
    null,
    2,
  );
}

/**
 * Clear all consent history (for account deletion / data erasure).
 */
export function clearConsentHistory(): void {
  localStorage.removeItem(CONSENT_HISTORY_KEY);
}
