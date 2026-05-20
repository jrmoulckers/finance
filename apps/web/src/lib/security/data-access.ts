// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Access Request — GDPR/CCPA self-service data export.
 *
 * Generates structured data export packages containing all user data
 * grouped by category. Supports inventory listing and package creation
 * for data portability compliance.
 *
 * References: issue #1654
 */

import type {
  DataAccessRequest,
  DataAccessRequestStatus,
  DataCategory,
  DataExportPackage,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All available data categories for export. */
export const ALL_DATA_CATEGORIES: readonly DataCategory[] = [
  'accounts',
  'transactions',
  'budgets',
  'goals',
  'categories',
  'settings',
  'consent',
  'audit_log',
] as const;

/** Human-readable descriptions for each data category. */
export const DATA_CATEGORY_DESCRIPTIONS: Readonly<Record<DataCategory, string>> = {
  accounts: 'Bank accounts, credit cards, and other financial accounts',
  transactions: 'All recorded income and expense transactions',
  budgets: 'Budget plans and spending limits by category',
  goals: 'Savings goals and progress tracking',
  categories: 'Custom transaction categories and subcategories',
  settings: 'App preferences, display settings, and configuration',
  consent: 'Consent records and privacy preference history',
  audit_log: 'Security event log and access history',
};

// ---------------------------------------------------------------------------
// Data Access Request functions
// ---------------------------------------------------------------------------

/**
 * Create a new data access request.
 *
 * @param categories - The data categories to include in the export.
 * @param format - Export format (default: 'json').
 * @returns A new DataAccessRequest in 'pending' status.
 */
export function createDataAccessRequest(
  categories: readonly DataCategory[],
  format: 'json' | 'csv' = 'json',
): DataAccessRequest {
  if (categories.length === 0) {
    throw new Error('At least one data category must be selected for export.');
  }

  return {
    id: crypto.randomUUID(),
    requestedAt: new Date().toISOString(),
    status: 'pending',
    categories,
    completedAt: null,
    format,
  };
}

/**
 * Advance the status of a data access request.
 *
 * @param request - The current request.
 * @param newStatus - The new status to set.
 * @returns A new request object with the updated status.
 */
export function updateRequestStatus(
  request: DataAccessRequest,
  newStatus: DataAccessRequestStatus,
): DataAccessRequest {
  return {
    ...request,
    status: newStatus,
    completedAt: newStatus === 'completed' ? new Date().toISOString() : request.completedAt,
  };
}

// ---------------------------------------------------------------------------
// Data inventory
// ---------------------------------------------------------------------------

/**
 * Build a data inventory summarizing what data exists per category.
 *
 * @param dataSources - A map of category to record arrays.
 * @returns An inventory object with counts per category.
 */
export function buildDataInventory(
  dataSources: Partial<Record<DataCategory, readonly Record<string, unknown>[]>>,
): Record<DataCategory, number> {
  const inventory = {} as Record<DataCategory, number>;

  for (const category of ALL_DATA_CATEGORIES) {
    const records = dataSources[category];
    inventory[category] = records ? records.length : 0;
  }

  return inventory;
}

// ---------------------------------------------------------------------------
// Export package generation
// ---------------------------------------------------------------------------

/**
 * Generate a structured data export package.
 *
 * Collects data from the provided sources for the requested categories
 * and packages it into a self-describing JSON structure suitable for
 * GDPR/CCPA data portability.
 *
 * @param request - The data access request specifying which categories to include.
 * @param dataSources - A map of category to record arrays.
 * @returns A complete DataExportPackage.
 */
export function generateExportPackage(
  request: DataAccessRequest,
  dataSources: Partial<Record<DataCategory, readonly Record<string, unknown>[]>>,
): DataExportPackage {
  const filteredData: Partial<Record<DataCategory, readonly Record<string, unknown>[]>> = {};
  let totalRecords = 0;

  for (const category of request.categories) {
    const records = dataSources[category] ?? [];
    filteredData[category] = records;
    totalRecords += records.length;
  }

  return {
    meta: {
      exportId: request.id,
      exportedAt: new Date().toISOString(),
      format: 'json',
      categories: request.categories,
      totalRecords,
    },
    data: filteredData,
  };
}

/**
 * Serialize an export package to a JSON string.
 *
 * @param pkg - The export package to serialize.
 * @returns A formatted JSON string (2-space indent).
 */
export function serializeExportPackage(pkg: DataExportPackage): string {
  return JSON.stringify(pkg, null, 2);
}
