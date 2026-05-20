// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for estate and end-of-life financial inventory utilities.
 *
 * References: #1774
 */

import { describe, it, expect } from 'vitest';
import {
  ESTATE_LEGAL_DISCLAIMER,
  ALL_ASSET_TYPES,
  ALL_DOCUMENT_TYPES,
  filterItemsByType,
  unassignedItems,
  itemsForBeneficiary,
  validateBeneficiaryAllocations,
  totalAllocationPercent,
  filterDocumentsByType,
  documentsWithoutDigitalCopy,
  checkEssentialDocuments,
  calculateEstateValueSummary,
  beneficiaryEstateValue,
  buildEstateInventory,
} from './estate-inventory';
import type { EstateItem, Beneficiary, EstateDocument } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const items: EstateItem[] = [
  {
    id: 'i1',
    name: 'Checking Account',
    type: 'bank_account',
    estimatedValueCents: 5000000,
    institution: 'Chase',
    accountLast4: '1234',
    contactInfo: '800-555-0001',
    beneficiaryIds: ['b1'],
    notes: '',
  },
  {
    id: 'i2',
    name: 'Investment Portfolio',
    type: 'investment',
    estimatedValueCents: 25000000,
    institution: 'Vanguard',
    accountLast4: '5678',
    contactInfo: '800-555-0002',
    beneficiaryIds: ['b1', 'b2'],
    notes: '',
  },
  {
    id: 'i3',
    name: 'House',
    type: 'real_estate',
    estimatedValueCents: 35000000,
    institution: '',
    accountLast4: '',
    contactInfo: '',
    beneficiaryIds: [],
    notes: 'Primary residence',
  },
  {
    id: 'i4',
    name: 'Life Insurance',
    type: 'insurance',
    estimatedValueCents: 50000000,
    institution: 'MetLife',
    accountLast4: '9012',
    contactInfo: '800-555-0003',
    beneficiaryIds: ['b2'],
    notes: '',
  },
  {
    id: 'i5',
    name: 'Crypto Wallet',
    type: 'digital_asset',
    estimatedValueCents: 1000000,
    institution: 'Coinbase',
    accountLast4: '',
    contactInfo: '',
    beneficiaryIds: [],
    notes: 'Hardware wallet in safe',
  },
];

const beneficiaries: Beneficiary[] = [
  {
    id: 'b1',
    name: 'Jane Doe',
    relationship: 'Spouse',
    contactInfo: 'jane@example.com',
    allocationPercent: 60,
  },
  {
    id: 'b2',
    name: 'John Jr',
    relationship: 'Child',
    contactInfo: 'john.jr@example.com',
    allocationPercent: 40,
  },
];

const documents: EstateDocument[] = [
  {
    id: 'd1',
    type: 'will',
    name: 'Last Will and Testament',
    physicalLocation: 'Home safe',
    hasDigitalCopy: true,
    lastUpdated: '2024-01-01',
    notes: '',
  },
  {
    id: 'd2',
    type: 'trust',
    name: 'Revocable Living Trust',
    physicalLocation: 'Attorney office',
    hasDigitalCopy: false,
    lastUpdated: '2023-06-15',
    notes: '',
  },
  {
    id: 'd3',
    type: 'power_of_attorney',
    name: 'Financial POA',
    physicalLocation: 'Home safe',
    hasDigitalCopy: true,
    lastUpdated: '2024-01-01',
    notes: '',
  },
  {
    id: 'd4',
    type: 'insurance_policy',
    name: 'Life Insurance Policy',
    physicalLocation: 'Filing cabinet',
    hasDigitalCopy: false,
    lastUpdated: '2022-01-01',
    notes: '',
  },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('ESTATE_LEGAL_DISCLAIMER', () => {
  it('contains legal disclaimer text', () => {
    expect(ESTATE_LEGAL_DISCLAIMER).toContain('not legal advice');
    expect(ESTATE_LEGAL_DISCLAIMER).toContain('estate planning attorney');
  });
});

describe('ALL_ASSET_TYPES', () => {
  it('contains all asset types', () => {
    expect(ALL_ASSET_TYPES).toContain('bank_account');
    expect(ALL_ASSET_TYPES).toContain('digital_asset');
    expect(ALL_ASSET_TYPES).toContain('real_estate');
    expect(ALL_ASSET_TYPES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('ALL_DOCUMENT_TYPES', () => {
  it('contains essential document types', () => {
    expect(ALL_DOCUMENT_TYPES).toContain('will');
    expect(ALL_DOCUMENT_TYPES).toContain('trust');
    expect(ALL_DOCUMENT_TYPES).toContain('power_of_attorney');
    expect(ALL_DOCUMENT_TYPES).toContain('healthcare_directive');
  });
});

// ---------------------------------------------------------------------------
// filterItemsByType
// ---------------------------------------------------------------------------

describe('filterItemsByType', () => {
  it('filters items by type', () => {
    const bankAccounts = filterItemsByType(items, 'bank_account');
    expect(bankAccounts).toHaveLength(1);
    expect(bankAccounts[0].id).toBe('i1');
  });

  it('returns empty for type with no items', () => {
    expect(filterItemsByType(items, 'vehicle')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// unassignedItems
// ---------------------------------------------------------------------------

describe('unassignedItems', () => {
  it('returns items with no beneficiaries', () => {
    const unassigned = unassignedItems(items);
    expect(unassigned).toHaveLength(2); // house and crypto
    expect(unassigned.some((i) => i.id === 'i3')).toBe(true);
    expect(unassigned.some((i) => i.id === 'i5')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// itemsForBeneficiary
// ---------------------------------------------------------------------------

describe('itemsForBeneficiary', () => {
  it('returns items assigned to a beneficiary', () => {
    const b1Items = itemsForBeneficiary(items, 'b1');
    expect(b1Items).toHaveLength(2); // checking + investment
  });

  it('returns empty for unknown beneficiary', () => {
    expect(itemsForBeneficiary(items, 'nonexistent')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateBeneficiaryAllocations
// ---------------------------------------------------------------------------

describe('validateBeneficiaryAllocations', () => {
  it('returns true when allocations sum to 100', () => {
    expect(validateBeneficiaryAllocations(beneficiaries, ['b1', 'b2'])).toBe(true);
  });

  it('returns true when allocations sum to less than 100', () => {
    expect(validateBeneficiaryAllocations(beneficiaries, ['b1'])).toBe(true);
  });

  it('returns false when allocations exceed 100', () => {
    const overAllocated: Beneficiary[] = [
      { ...beneficiaries[0], allocationPercent: 70 },
      { ...beneficiaries[1], allocationPercent: 50 },
    ];
    expect(validateBeneficiaryAllocations(overAllocated, ['b1', 'b2'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// totalAllocationPercent
// ---------------------------------------------------------------------------

describe('totalAllocationPercent', () => {
  it('sums allocations for given beneficiaries', () => {
    expect(totalAllocationPercent(beneficiaries, ['b1', 'b2'])).toBe(100);
  });

  it('returns 0 for empty list', () => {
    expect(totalAllocationPercent(beneficiaries, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterDocumentsByType
// ---------------------------------------------------------------------------

describe('filterDocumentsByType', () => {
  it('filters documents by type', () => {
    const wills = filterDocumentsByType(documents, 'will');
    expect(wills).toHaveLength(1);
    expect(wills[0].id).toBe('d1');
  });
});

// ---------------------------------------------------------------------------
// documentsWithoutDigitalCopy
// ---------------------------------------------------------------------------

describe('documentsWithoutDigitalCopy', () => {
  it('returns documents missing digital copies', () => {
    const missing = documentsWithoutDigitalCopy(documents);
    expect(missing).toHaveLength(2); // trust and insurance policy
    expect(missing.some((d) => d.id === 'd2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkEssentialDocuments
// ---------------------------------------------------------------------------

describe('checkEssentialDocuments', () => {
  it('identifies which essential documents are present', () => {
    const essentials = checkEssentialDocuments(documents);
    expect(essentials.get('will')).toBe(true);
    expect(essentials.get('trust')).toBe(true);
    expect(essentials.get('power_of_attorney')).toBe(true);
    expect(essentials.get('healthcare_directive')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateEstateValueSummary
// ---------------------------------------------------------------------------

describe('calculateEstateValueSummary', () => {
  it('calculates total estate value', () => {
    const summary = calculateEstateValueSummary(items);
    expect(summary.totalValueCents).toBe(116000000);
    expect(summary.totalItemCount).toBe(5);
  });

  it('counts unassigned items', () => {
    const summary = calculateEstateValueSummary(items);
    expect(summary.unassignedCount).toBe(2);
  });

  it('breaks down by type', () => {
    const summary = calculateEstateValueSummary(items);
    expect(summary.byType.length).toBeGreaterThan(0);
    // Insurance should be the largest
    expect(summary.byType[0].type).toBe('insurance');
  });

  it('sorts by value descending', () => {
    const summary = calculateEstateValueSummary(items);
    for (let i = 1; i < summary.byType.length; i++) {
      expect(summary.byType[i - 1].totalValueCents).toBeGreaterThanOrEqual(
        summary.byType[i].totalValueCents,
      );
    }
  });

  it('handles empty items', () => {
    const summary = calculateEstateValueSummary([]);
    expect(summary.totalValueCents).toBe(0);
    expect(summary.totalItemCount).toBe(0);
    expect(summary.byType).toHaveLength(0);
  });

  it('percentages are reasonable', () => {
    const summary = calculateEstateValueSummary(items);
    const totalPercent = summary.byType.reduce((sum, t) => sum + t.percent, 0);
    // Banker's rounding may cause slight deviation from 100
    expect(totalPercent).toBeGreaterThanOrEqual(95);
    expect(totalPercent).toBeLessThanOrEqual(105);
  });
});

// ---------------------------------------------------------------------------
// beneficiaryEstateValue
// ---------------------------------------------------------------------------

describe('beneficiaryEstateValue', () => {
  it('calculates total value for a beneficiary', () => {
    const value = beneficiaryEstateValue(items, 'b1');
    // checking (5M) + investment (25M) = 30M
    expect(value).toBe(30000000);
  });

  it('returns 0 for unknown beneficiary', () => {
    expect(beneficiaryEstateValue(items, 'nonexistent')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildEstateInventory
// ---------------------------------------------------------------------------

describe('buildEstateInventory', () => {
  it('builds a complete inventory', () => {
    const inventory = buildEstateInventory(items, beneficiaries, documents);
    expect(inventory.items).toHaveLength(5);
    expect(inventory.beneficiaries).toHaveLength(2);
    expect(inventory.documents).toHaveLength(4);
    expect(inventory.lastUpdated).toBeTruthy();
  });

  it('creates copies of arrays (no mutation)', () => {
    const inventory = buildEstateInventory(items, beneficiaries, documents);
    expect(inventory.items).not.toBe(items);
    expect(inventory.beneficiaries).not.toBe(beneficiaries);
    expect(inventory.documents).not.toBe(documents);
  });
});
