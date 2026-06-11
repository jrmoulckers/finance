// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the Privacy Dashboard data inventory.
 *
 * Provides a breakdown of locally stored data categories, estimated
 * storage usage, and descriptions of what data is stored for each
 * category.
 *
 * Usage:
 * ```tsx
 * const { categories, totalStorageEstimate } = usePrivacyDashboard();
 * ```
 *
 * References: issue #1636 (privacy dashboard with full data inventory)
 */

import { useCallback, useEffect, useState } from 'react';
import type { IconName } from '../components/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A data category stored locally. */
export interface DataCategory {
  /** Unique category identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Description of what data is stored. */
  readonly description: string;
  /** Where the data is stored. */
  readonly storageLocation: 'SQLite (OPFS)' | 'localStorage' | 'IndexedDB';
  /** Whether this data ever leaves the device. */
  readonly leavesDevice: boolean;
  /** Condition under which data leaves the device (if applicable). */
  readonly leavesDeviceCondition?: string;
  /** Estimated storage in bytes (0 if not calculable). */
  readonly estimatedBytes: number;
  /** Icon name for the category. */
  readonly icon: IconName;
}

/** Shape returned by {@link usePrivacyDashboard}. */
export interface UsePrivacyDashboardResult {
  /** Data categories with descriptions and storage info. */
  readonly categories: DataCategory[];
  /** Total estimated storage usage in bytes. */
  readonly totalStorageEstimate: number;
  /** Browser storage quota info (if available). */
  readonly storageQuota: StorageQuotaInfo | null;
  /** Whether data is loading. */
  readonly loading: boolean;
  /** Error message if estimation fails. */
  readonly error: string | null;
  /** Refresh storage estimates. */
  readonly refresh: () => void;
}

/** Browser storage quota information. */
export interface StorageQuotaInfo {
  /** Total quota in bytes. */
  readonly quota: number;
  /** Currently used in bytes. */
  readonly usage: number;
  /** Usage as a percentage (0–100). */
  readonly usagePercent: number;
}

// ---------------------------------------------------------------------------
// Data category definitions
// ---------------------------------------------------------------------------

/** Static data category metadata. */
const DATA_CATEGORY_DEFS: Omit<DataCategory, 'estimatedBytes'>[] = [
  {
    id: 'accounts',
    name: 'Financial Accounts',
    description:
      'Bank accounts, credit cards, and cash accounts you track. Includes account names, types, balances, and currency settings.',
    storageLocation: 'SQLite (OPFS)',
    leavesDevice: false,
    leavesDeviceCondition: 'Only if Cloud Sync is enabled',
    icon: 'bank',
  },
  {
    id: 'transactions',
    name: 'Transactions',
    description:
      'Income and expense records with dates, amounts, categories, merchants, and notes. This is typically the largest data category.',
    storageLocation: 'SQLite (OPFS)',
    leavesDevice: false,
    leavesDeviceCondition: 'Only if Cloud Sync is enabled',
    icon: 'wallet',
  },
  {
    id: 'budgets',
    name: 'Budgets',
    description:
      'Monthly or custom-period budgets with spending limits per category. Tracks budget vs. actual spending.',
    storageLocation: 'SQLite (OPFS)',
    leavesDevice: false,
    leavesDeviceCondition: 'Only if Cloud Sync is enabled',
    icon: 'chart-bar',
  },
  {
    id: 'goals',
    name: 'Savings Goals',
    description:
      'Financial goals with target amounts, deadlines, and progress tracking. Links to funding accounts.',
    storageLocation: 'SQLite (OPFS)',
    leavesDevice: false,
    leavesDeviceCondition: 'Only if Cloud Sync is enabled',
    icon: 'target',
  },
  {
    id: 'categories',
    name: 'Categories & Tags',
    description:
      'Custom spending categories and tags for organizing transactions. Includes auto-categorization rules.',
    storageLocation: 'SQLite (OPFS)',
    leavesDevice: false,
    icon: 'tag',
  },
  {
    id: 'settings',
    name: 'App Settings',
    description:
      'Your preferences: theme, currency, notification settings, privacy mode, and display options.',
    storageLocation: 'localStorage',
    leavesDevice: false,
    icon: 'settings',
  },
  {
    id: 'consent',
    name: 'Consent Records',
    description:
      'Timestamped records of your privacy consent choices. Required for GDPR compliance and your own audit trail.',
    storageLocation: 'localStorage',
    leavesDevice: false,
    icon: 'clipboard',
  },
  {
    id: 'estate',
    name: 'Estate Inventory',
    description:
      'Estate and end-of-life inventory entries, trusted contacts, and emergency instructions stored locally for beneficiaries.',
    storageLocation: 'localStorage',
    leavesDevice: false,
    icon: 'shield',
  },
  {
    id: 'investments',
    name: 'Investments',
    description: 'Investment holdings, portfolio allocations, and performance history.',
    storageLocation: 'SQLite (OPFS)',
    leavesDevice: false,
    leavesDeviceCondition: 'Only if Cloud Sync is enabled',
    icon: 'trending-up',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estimate localStorage usage for keys matching a prefix. */
function estimateLocalStorageBytes(prefix: string): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const value = localStorage.getItem(key);
        // UTF-16: each character is 2 bytes
        total += (key.length + (value?.length ?? 0)) * 2;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

/** Estimate total localStorage usage. */
function estimateTotalLocalStorageBytes(): number {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        total += (key.length + (value?.length ?? 0)) * 2;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Privacy dashboard data inventory and storage usage. */
export function usePrivacyDashboard(): UsePrivacyDashboardResult {
  const [categories, setCategories] = useState<DataCategory[]>([]);
  const [storageQuota, setStorageQuota] = useState<StorageQuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function estimate() {
      try {
        setLoading(true);

        // Estimate storage per category
        const estimated: DataCategory[] = DATA_CATEGORY_DEFS.map((def) => {
          let bytes = 0;

          if (def.storageLocation === 'localStorage') {
            if (def.id === 'consent') {
              bytes =
                estimateLocalStorageBytes('finance-gdpr-consent') +
                estimateLocalStorageBytes('finance-consent-history');
            } else if (def.id === 'estate') {
              bytes = estimateLocalStorageBytes('finance-estate-');
            } else if (def.id === 'settings') {
              bytes =
                estimateTotalLocalStorageBytes() -
                estimateLocalStorageBytes('finance-gdpr-consent') -
                estimateLocalStorageBytes('finance-consent-history') -
                estimateLocalStorageBytes('finance-estate-');
            }
          }
          // SQLite OPFS storage is estimated via the StorageManager API below.

          return { ...def, estimatedBytes: bytes };
        });

        if (!cancelled) {
          setCategories(estimated);
        }

        // Query browser StorageManager for quota info
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const est = await navigator.storage.estimate();
          if (!cancelled && est.quota !== undefined && est.usage !== undefined) {
            setStorageQuota({
              quota: est.quota,
              usage: est.usage,
              usagePercent:
                est.quota > 0 ? Math.round((est.usage / est.quota) * 100 * 100) / 100 : 0,
            });
          }
        }

        if (!cancelled) {
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to estimate storage.');
          setLoading(false);
        }
      }
    }

    void estimate();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const totalStorageEstimate = categories.reduce((sum, c) => sum + c.estimatedBytes, 0);

  return {
    categories,
    totalStorageEstimate,
    storageQuota,
    loading,
    error,
    refresh,
  };
}
