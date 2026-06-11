// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ESTATE_CATEGORIES } from './categories';
import {
  ESTATE_INVENTORY_STORAGE_KEY,
  createEmptyBeneficiary,
  createEmptyInventoryItem,
  deleteInventoryItem,
  listInventoryItems,
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
});
