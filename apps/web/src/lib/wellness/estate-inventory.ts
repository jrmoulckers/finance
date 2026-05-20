// SPDX-License-Identifier: BUSL-1.1

/**
 * Estate and end-of-life financial inventory utilities.
 *
 * Provides asset inventory management, beneficiary assignments, document
 * location tracking, account access information, and estate value summaries.
 *
 * **DISCLAIMER: This tool is for informational data-inventory purposes only.
 * It does NOT constitute legal advice. Consult a qualified estate planning
 * attorney for legal guidance regarding wills, trusts, and estate plans.**
 *
 * All monetary values are in integer cents.
 *
 * References: #1774
 */

import type {
  EstateItem,
  Beneficiary,
  EstateDocument,
  EstateInventory,
  EstateValueSummary,
  EstateAssetType,
  EstateDocumentType,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Legal disclaimer that MUST be displayed prominently in any UI
 * rendering estate inventory data.
 */
export const ESTATE_LEGAL_DISCLAIMER =
  'This is not legal advice. This tool provides a data inventory only. ' +
  'Consult a qualified estate planning attorney for legal guidance ' +
  'regarding wills, trusts, powers of attorney, and estate plans.';

/** All valid estate asset types. */
export const ALL_ASSET_TYPES: readonly EstateAssetType[] = [
  'bank_account',
  'investment',
  'retirement',
  'real_estate',
  'vehicle',
  'insurance',
  'digital_asset',
  'personal_property',
  'business',
  'other',
] as const;

/** All valid estate document types. */
export const ALL_DOCUMENT_TYPES: readonly EstateDocumentType[] = [
  'will',
  'trust',
  'power_of_attorney',
  'healthcare_directive',
  'insurance_policy',
  'deed',
  'title',
  'beneficiary_designation',
  'other',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding: rounds half to even.
 *
 * @param value - The value to round
 * @returns Rounded integer
 */
function bankersRound(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - (rounded - 0.5)) < Number.EPSILON) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}

// ---------------------------------------------------------------------------
// Estate item management
// ---------------------------------------------------------------------------

/**
 * Filter estate items by asset type.
 *
 * @param items - All estate items
 * @param type - Asset type to filter by
 * @returns Filtered items
 */
export function filterItemsByType(
  items: readonly EstateItem[],
  type: EstateAssetType,
): EstateItem[] {
  return items.filter((i) => i.type === type);
}

/**
 * Get estate items that have no beneficiary assignments.
 *
 * @param items - All estate items
 * @returns Items without any beneficiary
 */
export function unassignedItems(items: readonly EstateItem[]): EstateItem[] {
  return items.filter((i) => i.beneficiaryIds.length === 0);
}

/**
 * Get estate items assigned to a specific beneficiary.
 *
 * @param items - All estate items
 * @param beneficiaryId - Beneficiary ID
 * @returns Items assigned to this beneficiary
 */
export function itemsForBeneficiary(
  items: readonly EstateItem[],
  beneficiaryId: string,
): EstateItem[] {
  return items.filter((i) => i.beneficiaryIds.includes(beneficiaryId));
}

// ---------------------------------------------------------------------------
// Beneficiary management
// ---------------------------------------------------------------------------

/**
 * Validate that beneficiary allocation percentages sum to 100% or less for an item.
 *
 * @param beneficiaries - All beneficiaries
 * @param beneficiaryIds - IDs assigned to an item
 * @returns Whether allocations are valid (sum ≤ 100)
 */
export function validateBeneficiaryAllocations(
  beneficiaries: readonly Beneficiary[],
  beneficiaryIds: readonly string[],
): boolean {
  const total = beneficiaries
    .filter((b) => beneficiaryIds.includes(b.id))
    .reduce((sum, b) => sum + b.allocationPercent, 0);
  return total <= 100;
}

/**
 * Calculate total allocation percentage for a set of beneficiaries.
 *
 * @param beneficiaries - All beneficiaries
 * @param beneficiaryIds - IDs to sum
 * @returns Total allocation percentage
 */
export function totalAllocationPercent(
  beneficiaries: readonly Beneficiary[],
  beneficiaryIds: readonly string[],
): number {
  return beneficiaries
    .filter((b) => beneficiaryIds.includes(b.id))
    .reduce((sum, b) => sum + b.allocationPercent, 0);
}

// ---------------------------------------------------------------------------
// Document tracking
// ---------------------------------------------------------------------------

/**
 * Filter documents by type.
 *
 * @param documents - All estate documents
 * @param type - Document type to filter by
 * @returns Filtered documents
 */
export function filterDocumentsByType(
  documents: readonly EstateDocument[],
  type: EstateDocumentType,
): EstateDocument[] {
  return documents.filter((d) => d.type === type);
}

/**
 * Get documents that are missing a digital copy.
 *
 * @param documents - All estate documents
 * @returns Documents without digital copies
 */
export function documentsWithoutDigitalCopy(
  documents: readonly EstateDocument[],
): EstateDocument[] {
  return documents.filter((d) => !d.hasDigitalCopy);
}

/**
 * Check which essential document types are present.
 *
 * @param documents - All estate documents
 * @returns Map of essential document type to whether it exists
 */
export function checkEssentialDocuments(
  documents: readonly EstateDocument[],
): ReadonlyMap<EstateDocumentType, boolean> {
  const essentials: EstateDocumentType[] = [
    'will',
    'trust',
    'power_of_attorney',
    'healthcare_directive',
  ];
  const presentTypes = new Set(documents.map((d) => d.type));
  return new Map(essentials.map((t) => [t, presentTypes.has(t)]));
}

// ---------------------------------------------------------------------------
// Estate value summary
// ---------------------------------------------------------------------------

/**
 * Calculate a comprehensive estate value summary.
 *
 * @param items - All estate items
 * @returns Estate value summary with breakdown by type
 */
export function calculateEstateValueSummary(items: readonly EstateItem[]): EstateValueSummary {
  const totalValueCents = items.reduce((sum, i) => sum + i.estimatedValueCents, 0);
  const totalItemCount = items.length;
  const unassignedCount = unassignedItems(items).length;

  // Group by type
  const typeMap = new Map<EstateAssetType, { count: number; totalValueCents: number }>();
  for (const item of items) {
    const existing = typeMap.get(item.type) ?? { count: 0, totalValueCents: 0 };
    existing.count++;
    existing.totalValueCents += item.estimatedValueCents;
    typeMap.set(item.type, existing);
  }

  const byType = Array.from(typeMap.entries())
    .map(([type, data]) => ({
      type,
      count: data.count,
      totalValueCents: data.totalValueCents,
      percent:
        totalValueCents > 0 ? bankersRound((data.totalValueCents / totalValueCents) * 100) : 0,
    }))
    .sort((a, b) => b.totalValueCents - a.totalValueCents);

  return {
    totalValueCents,
    byType,
    unassignedCount,
    totalItemCount,
  };
}

/**
 * Calculate total estimated value for a specific beneficiary.
 *
 * Uses each item's full value (does not split by allocation percent)
 * because allocation may overlap across beneficiaries.
 *
 * @param items - All estate items
 * @param beneficiaryId - Beneficiary ID
 * @returns Total value of items assigned to this beneficiary in cents
 */
export function beneficiaryEstateValue(
  items: readonly EstateItem[],
  beneficiaryId: string,
): number {
  return itemsForBeneficiary(items, beneficiaryId).reduce(
    (sum, i) => sum + i.estimatedValueCents,
    0,
  );
}

/**
 * Build a complete estate inventory object.
 *
 * @param items - Estate items
 * @param beneficiaries - Beneficiaries
 * @param documents - Estate documents
 * @returns Complete estate inventory
 */
export function buildEstateInventory(
  items: readonly EstateItem[],
  beneficiaries: readonly Beneficiary[],
  documents: readonly EstateDocument[],
): EstateInventory {
  return {
    items: [...items],
    beneficiaries: [...beneficiaries],
    documents: [...documents],
    lastUpdated: new Date().toISOString(),
  };
}
