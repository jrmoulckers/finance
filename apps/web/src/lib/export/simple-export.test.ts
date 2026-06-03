// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import type { SqliteDb } from '../../db/sqlite-wasm';
import {
  buildDatedExportFileName,
  buildFullJsonExport,
  buildTransactionsCsv,
  escapeCsvField,
  serializeFullJsonExport,
} from './simple-export';

vi.mock('../../db/repositories/accounts', () => ({
  getAllAccounts: vi.fn(() => [
    { id: 'acc-1', householdId: 'hh-1', name: 'Checking', currency: { code: 'USD' } },
  ]),
}));

vi.mock('../../db/repositories/transactions', () => ({
  getAllTransactions: vi.fn(() => [
    {
      id: 'txn-1',
      householdId: 'hh-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      date: '2024-03-06',
      payee: 'Grocery Store',
      note: null,
      statementDescription: null,
      amount: { amount: -6742 },
      currency: { code: 'USD' },
    },
  ]),
}));

vi.mock('../../db/repositories/categories', () => ({
  getAllCategories: vi.fn(() => [{ id: 'cat-1', householdId: 'hh-1', name: 'Food' }]),
}));

vi.mock('../../db/repositories/budgets', () => ({
  getAllBudgets: vi.fn(() => [{ id: 'budget-1', householdId: 'hh-1', categoryId: 'cat-1' }]),
}));

vi.mock('../../db/repositories/goals', () => ({
  getAllGoals: vi.fn(() => [{ id: 'goal-1', householdId: 'hh-1', name: 'Emergency fund' }]),
}));

vi.mock('../../db/repositories/bills', () => ({
  getAllBills: vi.fn(() => [{ id: 'bill-1', householdId: 'hh-1', name: 'Internet' }]),
}));

vi.mock('../../db/repositories/investments', () => ({
  getAllInvestments: vi.fn(() => [{ id: 'inv-1', householdId: 'hh-1', symbol: 'VTI' }]),
}));

vi.mock('../../db/repositories/investment-lots', () => ({
  getLotsByInvestment: vi.fn(() => [{ id: 'lot-1', investmentId: 'inv-1', shares: 1 }]),
}));

vi.mock('../../db/repositories/household', () => ({
  getHouseholdById: vi.fn(() => ({ id: 'hh-1', name: 'Home', ownerId: 'owner-1' })),
  getHouseholdMembers: vi.fn(() => [{ id: 'member-1', householdId: 'hh-1', userId: 'owner-1' }]),
  getHouseholdInvitations: vi.fn(() => []),
  getAccountSharings: vi.fn(() => [{ id: 'sharing-1', householdId: 'hh-1', accountId: 'acc-1' }]),
  getSharedBudgets: vi.fn(() => [
    { id: 'shared-budget-1', householdId: 'hh-1', budgetId: 'budget-1' },
  ]),
  getBudgetContributions: vi.fn(() => []),
  getSharedGoals: vi.fn(() => [{ id: 'shared-goal-1', householdId: 'hh-1', goalId: 'goal-1' }]),
  getGoalContributions: vi.fn(() => []),
}));

function createMockDb(): SqliteDb {
  return { exec: vi.fn(), close: vi.fn() } as unknown as SqliteDb;
}

describe('simple-export', () => {
  it('builds a full structured JSON export from local repositories', () => {
    const generatedAt = new Date('2026-05-26T12:00:00Z');
    const result = buildFullJsonExport(createMockDb(), {
      appVersion: '0.1.0',
      generatedAt,
      preferences: [{ key: 'finance-currency', value: 'USD' }],
      settings: [{ key: 'theme', value: 'system' }],
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2026-05-26T12:00:00.000Z',
      appVersion: '0.1.0',
      accounts: [{ id: 'acc-1' }],
      transactions: [{ id: 'txn-1' }],
      categories: [{ id: 'cat-1' }],
      budgets: [{ id: 'budget-1' }],
      goals: [{ id: 'goal-1' }],
      bills: [{ id: 'bill-1' }],
      investments: [{ id: 'inv-1' }],
      investmentLots: [{ id: 'lot-1' }],
      households: [{ id: 'hh-1' }],
      householdMembers: [{ id: 'member-1' }],
      accountSharings: [{ id: 'sharing-1' }],
      sharedBudgets: [{ id: 'shared-budget-1' }],
      sharedGoals: [{ id: 'shared-goal-1' }],
      preferences: [{ key: 'finance-currency', value: 'USD' }],
      settings: [{ key: 'theme', value: 'system' }],
    });
    expect(serializeFullJsonExport(result)).toContain('"transactions"');
  });

  it('builds denormalized transaction CSV with manual escaping', () => {
    const csv = buildTransactionsCsv({
      accounts: [{ id: 'acc-1', name: 'Checking' }],
      categories: [{ id: 'cat-1', name: 'Food' }],
      transactions: [
        {
          accountId: 'acc-1',
          categoryId: 'cat-1',
          date: '2024-03-06',
          payee: 'Grocery, "Fresh"\nMarket',
          note: null,
          statementDescription: null,
          amount: { amount: -6742 },
          currency: { code: 'USD' },
        },
      ],
    });

    expect(csv).toBe(
      'date,account_name,category_name,description,amount,currency\r\n' +
        '2024-03-06,Checking,Food,"Grocery, ""Fresh""\nMarket",-67.42,USD\r\n',
    );
  });

  it('keeps simple CSV fields unquoted and dates filenames', () => {
    expect(escapeCsvField('plain value')).toBe('plain value');
    expect(buildDatedExportFileName('finance-data', 'json', new Date('2026-05-26T12:00:00Z'))).toBe(
      'finance-data-2026-05-26.json',
    );
  });
});
