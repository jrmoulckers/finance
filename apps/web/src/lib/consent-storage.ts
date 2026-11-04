// SPDX-License-Identifier: BUSL-1.1

/**
 * GDPR Consent Storage — manages user consent preferences.
 *
 * Consent is stored in localStorage (not in cookies, since this is a PWA
 * that doesn't need server-side cookie consent).  The consent record
 * includes:
 *   - Which categories have been consented to
 *   - Timestamp of consent
 *   - Version of the privacy policy at consent time
 *   - Method of consent (first-run dialog, settings page, etc.)
 *
 * GDPR compliance:
 *   - Consent is affirmative (opt-in, not opt-out)
 *   - Consent is granular (separate categories)
 *   - Consent is revocable at any time via settings
 *   - Consent record is exportable as part of data export
 *   - All consent changes are timestamped
 *
 * References: issue #443 (GDPR consent — critical legal blocker)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Consent categories aligned with GDPR data processing purposes. */
export type ConsentCategory =
  | 'essential' // Always required — app functionality
  | 'analytics' // Anonymous usage analytics
  | 'error_reporting' // Crash/error reporting
  | 'sync' // Cloud sync / server communication
  | 'marketing'; // Marketing communications (email, push)

/** A single consent decision with metadata. */
export interface ConsentRecord {
  /** Which categories the user has consented to. */
  readonly categories: Record<ConsentCategory, boolean>;
  /** ISO-8601 timestamp when consent was given/updated. */
  readonly timestamp: string;
  /** Version of the privacy policy at the time of consent. */
  readonly policyVersion: string;
  /** How consent was collected. */
  readonly method: 'first_run' | 'settings' | 'banner';
  /** Whether the user has completed the initial consent flow. */
  readonly hasCompletedFirstRun: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for consent storage. */
const CONSENT_STORAGE_KEY = 'finance-gdpr-consent';

/** Current privacy policy version — bump when policy changes. */
export const CURRENT_POLICY_VERSION = '1.0.0';

/** Default consent state — only essential is enabled. */
export const DEFAULT_CONSENT: ConsentRecord = {
  categories: {
    essential: true,
    analytics: false,
    error_reporting: false,
    sync: false,
    marketing: false,
  },
  timestamp: '',
  policyVersion: CURRENT_POLICY_VERSION,
  method: 'first_run',
  hasCompletedFirstRun: false,
};

/** Human-readable labels for consent categories. */
export const CONSENT_LABELS: Record<ConsentCategory, string> = {
  essential: 'Essential',
  analytics: 'Analytics',
  error_reporting: 'Error Reporting',
  sync: 'Cloud Sync',
  marketing: 'Marketing Communications',
};

/** Descriptions for consent categories. */
export const CONSENT_DESCRIPTIONS: Record<ConsentCategory, string> = {
  essential:
    'Required for the app to function. Includes local data storage, authentication, and core features.',
  analytics:
    'Anonymous usage data to help us understand how the app is used and improve the experience.',
  error_reporting: 'Crash reports and error logs to help us identify and fix bugs quickly.',
  sync: 'Sync your financial data across your devices. Not used in local-only mode.',
  marketing:
    'Occasional emails about new features, tips, and product updates. You can unsubscribe at any time.',
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Load the current consent record from localStorage.
 *
 * Returns the default (no consent) if no record exists or if parsing fails.
 */
export function loadConsent(): ConsentRecord {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONSENT };

    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;

    // Validate structure
    if (!parsed.categories || typeof parsed.categories !== 'object') {
      return { ...DEFAULT_CONSENT };
    }

    return {
      categories: {
        essential: true, // Always true
        analytics: parsed.categories.analytics === true,
        error_reporting: parsed.categories.error_reporting === true,
        sync: parsed.categories.sync === true,
        marketing: parsed.categories.marketing === true,
      },
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : '',
      policyVersion: typeof parsed.policyVersion === 'string' ? parsed.policyVersion : '',
      method: parsed.method ?? 'first_run',
      hasCompletedFirstRun: parsed.hasCompletedFirstRun === true,
    };
  } catch {
    return { ...DEFAULT_CONSENT };
  }
}

/**
 * Save a consent record to localStorage.
 */
export function saveConsent(consent: ConsentRecord): void {
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
}

/**
 * Update specific consent categories, preserving others.
 */
export function updateConsent(
  categories: Partial<Record<ConsentCategory, boolean>>,
  method: ConsentRecord['method'] = 'settings',
): ConsentRecord {
  const current = loadConsent();
  const updated: ConsentRecord = {
    categories: {
      essential: true, // Always true
      analytics: categories.analytics ?? current.categories.analytics,
      error_reporting: categories.error_reporting ?? current.categories.error_reporting,
      sync: categories.sync ?? current.categories.sync,
      marketing: categories.marketing ?? current.categories.marketing,
    },
    timestamp: new Date().toISOString(),
    policyVersion: CURRENT_POLICY_VERSION,
    method,
    hasCompletedFirstRun: true,
  };
  saveConsent(updated);
  return updated;
}

/**
 * Check if the user has completed the first-run consent flow.
 */
export function hasCompletedConsent(): boolean {
  return loadConsent().hasCompletedFirstRun;
}

/**
 * Check if a specific consent category is enabled.
 */
export function hasConsent(category: ConsentCategory): boolean {
  return loadConsent().categories[category] === true;
}

/**
 * Check if the consent needs to be re-collected (policy version changed).
 */
export function needsConsentRefresh(): boolean {
  const consent = loadConsent();
  if (!consent.hasCompletedFirstRun) return true;
  return consent.policyVersion !== CURRENT_POLICY_VERSION;
}

/**
 * Revoke all non-essential consent.
 */
export function revokeAllConsent(): ConsentRecord {
  return updateConsent({
    analytics: false,
    error_reporting: false,
    sync: false,
    marketing: false,
  });
}

/**
 * Clear all consent data (for account deletion).
 */
export function clearConsentData(): void {
  localStorage.removeItem(CONSENT_STORAGE_KEY);
}

/**
 * Export consent record for GDPR data portability.
 */
export function exportConsentRecord(): string {
  const consent = loadConsent();
  return JSON.stringify(
    {
      type: 'gdpr_consent_record',
      exportedAt: new Date().toISOString(),
      consent,
    },
    null,
    2,
  );
}
