// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for consent history with timestamped proof.
 *
 * Provides access to the consent audit log and actions for recording
 * consent changes with full GDPR-compliant timestamping.
 *
 * Usage:
 * ```tsx
 * const { history, recordChange, exportHistory } = useConsentHistory();
 * ```
 *
 * References: issue #1641 (granular consent management with proof)
 */

import { useCallback, useState } from 'react';
import {
  loadConsentHistory,
  recordConsentChange,
  recordBulkConsentChanges,
  exportConsentHistory,
  clearConsentHistory,
  type ConsentEvent,
} from '../lib/consent-history';
import { CURRENT_POLICY_VERSION, type ConsentCategory } from '../lib/consent-storage';
import { appendSecurityAuditEvent } from '../lib/security-audit-log';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Shape returned by {@link useConsentHistory}. */
export interface UseConsentHistoryResult {
  /** All consent change events, newest first. */
  readonly history: ConsentEvent[];
  /** Whether the history is loading. */
  readonly loading: boolean;
  /** Record a single consent change. */
  readonly recordChange: (
    category: ConsentCategory,
    granted: boolean,
    method?: ConsentEvent['method'],
  ) => void;
  /** Record multiple consent changes at once. */
  readonly recordBulkChanges: (
    changes: ReadonlyArray<{ category: ConsentCategory; granted: boolean }>,
    method?: ConsentEvent['method'],
  ) => void;
  /** Export consent history as JSON string. */
  readonly exportHistory: () => string;
  /** Clear all history (for account deletion). */
  readonly clearHistory: () => void;
  /** Refresh history from storage. */
  readonly refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Manage consent history with timestamped proof. */
export function useConsentHistory(): UseConsentHistoryResult {
  const [history, setHistory] = useState<ConsentEvent[]>(() =>
    loadConsentHistory().slice().reverse(),
  );
  const [loading] = useState(false);

  const refresh = useCallback(() => {
    setHistory(loadConsentHistory().slice().reverse());
  }, []);

  const recordChange = useCallback(
    (category: ConsentCategory, granted: boolean, method: ConsentEvent['method'] = 'settings') => {
      recordConsentChange(category, granted, method, CURRENT_POLICY_VERSION);
      void appendSecurityAuditEvent({
        action: 'consent_changed',
        result: 'success',
        metadata: { category, granted, method },
      });
      refresh();
    },
    [refresh],
  );

  const recordBulkChanges = useCallback(
    (
      changes: ReadonlyArray<{ category: ConsentCategory; granted: boolean }>,
      method: ConsentEvent['method'] = 'bulk',
    ) => {
      recordBulkConsentChanges(changes, method, CURRENT_POLICY_VERSION);
      void appendSecurityAuditEvent({
        action: 'consent_changed',
        result: 'success',
        metadata: { method, changes },
      });
      refresh();
    },
    [refresh],
  );

  const doExportHistory = useCallback(() => {
    return exportConsentHistory();
  }, []);

  const doClearHistory = useCallback(() => {
    clearConsentHistory();
    refresh();
  }, [refresh]);

  return {
    history,
    loading,
    recordChange,
    recordBulkChanges,
    exportHistory: doExportHistory,
    clearHistory: doClearHistory,
    refresh,
  };
}
