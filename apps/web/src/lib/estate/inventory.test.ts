// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ESTATE_CATEGORIES } from './categories';
import {
  ESTATE_INVENTORY_STORAGE_KEY,
  createEmptyBeneficiary,
  createEmptyInventoryItem,
  deleteInventoryItem,
  listInventoryItems,
  parseEstateCurrencyToCents,
  saveInventoryItem,
  summarizeInventory,
} from './inventory';

describe('estate inventory storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    let uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () => `11111111-1111-4111-8111-${String(++uuidCounter).padStart(12, '0')}`,
    );
  });

  it('creates, updates, and deletes estate inventory items', () => {
    const item = createEmptyInventoryItem('bank-accounts');
    const beneficiary = createEmptyBeneficiary();

    const saved = saveInventoryItem({
      ...item,
      details: {
        institution: 'First National Bank',
        accountType: 'Checking',
        approximateBalance: '25000',
      },
      beneficiaries: [
        {
          ...beneficiary,
          name: 'Alex Doe',
          relationship: 'Spouse',
        },
      ],
      documentLocation: 'Fire safe',
      lastVerifiedAt: '2026-01-01',
    });

    expect(listInventoryItems()).toHaveLength(1);
    expect(listInventoryItems()[0]?.details.institution).toBe('First National Bank');

    saveInventoryItem({
      ...saved,
      details: {
        ...saved.details,
        approximateBalance: '30000',
      },
    });

    expect(listInventoryItems()[0]?.details.approximateBalance).toBe('30000');

    deleteInventoryItem(saved.id);
    expect(listInventoryItems()).toEqual([]);
    expect(window.localStorage.getItem(ESTATE_INVENTORY_STORAGE_KEY)).toBe('[]');
  });

  it('summarizes documented and missing categories', () => {
    saveInventoryItem({
      ...createEmptyInventoryItem('bank-accounts'),
      details: { institution: 'Bank', accountType: 'Checking' },
      documentLocation: 'Safe',
      lastVerifiedAt: '2026-01-02',
    });
    saveInventoryItem({
      ...createEmptyInventoryItem('important-contacts'),
      details: { contactName: 'Morgan Lee', role: 'Attorney', phone: '555-1212' },
    });

    const summary = summarizeInventory();

    expect(summary.totalItems).toBe(2);
    expect(summary.documentedCategories).toEqual(['bank-accounts', 'important-contacts']);
    expect(summary.missingCategories).toHaveLength(ESTATE_CATEGORIES.length - 2);
    expect(summary.itemsMissingDocuments).toBe(1);
    expect(summary.itemsMissingVerification).toBe(1);
  });

  it('parses free-text currency fields to integer cents (#3288)', () => {
    expect(parseEstateCurrencyToCents('25000')).toBe(2_500_000);
    expect(parseEstateCurrencyToCents('$1,250.50')).toBe(125_050);
    expect(parseEstateCurrencyToCents('19.99')).toBe(1_999);
    expect(parseEstateCurrencyToCents('')).toBe(0);
    expect(parseEstateCurrencyToCents('n/a')).toBe(0);
    expect(parseEstateCurrencyToCents('-500')).toBe(50_000);
  });

  it('totals estimated estate value with assets minus liabilities (#3288)', () => {
    saveInventoryItem({
      ...createEmptyInventoryItem('bank-accounts'),
      details: { institution: 'Bank', accountType: 'Checking', approximateBalance: '25000' },
    });
    saveInventoryItem({
      ...createEmptyInventoryItem('investments'),
      details: { brokerage: 'Vanguard', investmentType: 'IRA', approximateValue: '175000' },
    });
    saveInventoryItem({
      ...createEmptyInventoryItem('debts'),
      details: { creditor: 'Chase', debtType: 'Mortgage', approximateBalance: '120000' },
    });
    // Insurance coverage is "other" — summarised but excluded from the net total.
    saveInventoryItem({
      ...createEmptyInventoryItem('insurance'),
      details: { provider: 'NWM', policyType: 'Life', coverageAmount: '500000' },
    });

    const summary = summarizeInventory();

    expect(summary.hasEstimatedValue).toBe(true);
    expect(summary.totalAssetsCents).toBe(20_000_000); // 25k + 175k
    expect(summary.totalLiabilitiesCents).toBe(12_000_000); // 120k
    expect(summary.netEstimatedValueCents).toBe(8_000_000); // 200k - 120k
    const insurance = summary.categoryValueSubtotals.find((s) => s.categoryId === 'insurance');
    expect(insurance?.kind).toBe('other');
    expect(insurance?.totalCents).toBe(50_000_000);
  });

  it('reports no estimated value when no currency fields are filled (#3288)', () => {
    saveInventoryItem({
      ...createEmptyInventoryItem('important-contacts'),
      details: { contactName: 'Morgan Lee', role: 'Attorney', phone: '555-1212' },
    });
    const summary = summarizeInventory();
    expect(summary.hasEstimatedValue).toBe(false);
    expect(summary.netEstimatedValueCents).toBe(0);
    expect(summary.categoryValueSubtotals).toEqual([]);
  });
});
