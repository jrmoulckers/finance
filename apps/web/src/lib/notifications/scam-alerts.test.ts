// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { detectScamAlerts, scamAlertsToNotifications } from './scam-alerts';

const syncMetadata = {
  createdAt: '2025-03-01T10:00:00Z',
  updatedAt: '2025-03-01T10:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-general',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 2500 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Grocery Store',
    note: null,
    date: '2025-03-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

describe('detectScamAlerts', () => {
  it('detects unusually large transactions for a category', () => {
    const transactions = [
      makeTransaction({
        id: 'history-1',
        amount: { amount: 10000 },
        categoryId: 'category-home',
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({
        id: 'history-2',
        amount: { amount: 11000 },
        categoryId: 'category-home',
        createdAt: '2025-03-02T10:00:00Z',
      }),
      makeTransaction({
        id: 'history-3',
        amount: { amount: 9000 },
        categoryId: 'category-home',
        createdAt: '2025-03-03T10:00:00Z',
      }),
      makeTransaction({
        id: 'large-1',
        amount: { amount: 48000 },
        categoryId: 'category-home',
        payee: 'Grocery Store',
        createdAt: '2025-03-04T10:00:00Z',
      }),
    ];

    const alerts = detectScamAlerts(transactions);

    const largeAlert = alerts.find((alert) => alert.rule === 'unusually-large');
    expect(largeAlert).toBeDefined();
    expect(largeAlert?.message).toContain('$480.00');
    expect(largeAlert?.nextStep).toMatch(/receipt|order history/i);
  });

  it('detects a brand-new merchant', () => {
    const transactions = [
      makeTransaction({
        id: 'history-1',
        payee: 'Grocery Store',
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({ id: 'history-2', payee: 'Pharmacy', createdAt: '2025-03-02T10:00:00Z' }),
      makeTransaction({
        id: 'new-1',
        payee: 'XYZ LLC',
        amount: { amount: 48000 },
        createdAt: '2025-03-03T10:00:00Z',
      }),
    ];

    const alerts = detectScamAlerts(transactions);

    const newMerchantAlert = alerts.find((alert) => alert.rule === 'new-merchant');
    expect(newMerchantAlert).toBeDefined();
    expect(newMerchantAlert?.message).toContain('which is new to you');
    expect(newMerchantAlert?.nextStep).toContain('number on your card');
  });

  it('detects possible duplicate charges within 24 hours', () => {
    const transactions = [
      makeTransaction({
        id: 'dupe-1',
        payee: 'Utility Co',
        amount: { amount: 12500 },
        createdAt: '2025-03-03T10:00:00Z',
      }),
      makeTransaction({
        id: 'dupe-2',
        payee: 'Utility Co',
        amount: { amount: 12500 },
        createdAt: '2025-03-03T14:00:00Z',
      }),
    ];

    const alerts = detectScamAlerts(transactions);

    const duplicateAlert = alerts.find((alert) => alert.rule === 'possible-duplicate');
    expect(duplicateAlert).toBeDefined();
    expect(duplicateAlert?.message).toContain('within 24 hours');
    expect(duplicateAlert?.nextStep).toContain('only bought this once');
  });

  it('detects rapid succession charges', () => {
    const transactions = [
      makeTransaction({
        id: 'rapid-1',
        payee: 'Coffee One',
        amount: { amount: 1200 },
        createdAt: '2025-03-03T10:00:00Z',
      }),
      makeTransaction({
        id: 'rapid-2',
        payee: 'Coffee Two',
        amount: { amount: 1300 },
        createdAt: '2025-03-03T10:04:00Z',
      }),
      makeTransaction({
        id: 'rapid-3',
        payee: 'Coffee Three',
        amount: { amount: 1400 },
        createdAt: '2025-03-03T10:08:00Z',
      }),
    ];

    const alerts = detectScamAlerts(transactions);

    const rapidAlert = alerts.find((alert) => alert.rule === 'rapid-succession');
    expect(rapidAlert).toBeDefined();
    expect(rapidAlert?.message).toContain('3 charges within 10 minutes');
    expect(rapidAlert?.nextStep).toContain('call your bank');
  });

  it('detects round large amounts to unfamiliar merchants', () => {
    const transactions = [
      makeTransaction({
        id: 'history-1',
        payee: 'Grocery Store',
        amount: { amount: 4500 },
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({
        id: 'round-1',
        payee: 'Wire Helper LLC',
        amount: { amount: 70000 },
        createdAt: '2025-03-02T10:00:00Z',
      }),
    ];

    const alerts = detectScamAlerts(transactions);

    const roundAlert = alerts.find((alert) => alert.rule === 'round-large-unfamiliar');
    expect(roundAlert).toBeDefined();
    expect(roundAlert?.message).toContain('large and round');
    expect(roundAlert?.nextStep).toContain('number on your card');
  });

  it('returns no alerts for ordinary familiar spending', () => {
    const transactions = [
      makeTransaction({
        id: 'history-1',
        payee: 'Grocery Store',
        amount: { amount: 4500 },
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({
        id: 'normal-1',
        payee: 'Grocery Store',
        amount: { amount: 5200 },
        createdAt: '2025-03-02T10:00:00Z',
      }),
    ];

    expect(detectScamAlerts(transactions)).toEqual([]);
  });

  it('converts alerts to notification-center messages with clear next steps', () => {
    const [alert] = detectScamAlerts([
      makeTransaction({
        id: 'history-1',
        payee: 'Grocery Store',
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({ id: 'new-1', payee: 'XYZ LLC', createdAt: '2025-03-02T10:00:00Z' }),
    ]).filter((candidate) => candidate.rule === 'new-merchant');

    const [notification] = scamAlertsToNotifications(alert === undefined ? [] : [alert]);

    expect(notification?.type).toBe('scam_check');
    expect(notification?.message).toContain('NEXT STEP:');
  });
});
