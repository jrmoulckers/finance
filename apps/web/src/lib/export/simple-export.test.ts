// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import type { SqliteDb } from '../../db/sqlite-wasm';
import { createSqliteAsyncDb, type AsyncDb } from '../../db/async-db';
import {
  buildAllCsvZip,
  buildDatedExportFileName,
  buildEntityCsvFiles,
  buildExportManifest,
  buildFullJsonExport,
  buildGenericCsv,
  buildPdfSummary,
  buildTransactionsCsv,
  buildXlsxWorkbook,
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

function createMockDb(): AsyncDb {
  return createSqliteAsyncDb({
    exec: vi.fn(),
    selectAll: vi.fn(() => []),
    selectOne: vi.fn(() => null),
    close: vi.fn(async () => undefined),
  } as unknown as SqliteDb);
}

describe('simple-export', () => {
  it('builds a full structured JSON export from local repositories', async () => {
    const generatedAt = new Date('2026-05-26T12:00:00Z');
    const result = await buildFullJsonExport(createMockDb(), {
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

  it('degrades to an empty list when a repository throws (not just no-such-table)', async () => {
    const accounts = await import('../../db/repositories/accounts');
    const transactions = await import('../../db/repositories/transactions');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // A populated row that fails strict mapping (e.g. missing required
    // household_id on a pre-migration legacy row) used to abort the whole
    // export with an unhandled exception. The export now logs + skips so
    // every other entity is still serialized. (Regression: #1963.)
    const original = vi.mocked(accounts.getAllAccounts).getMockImplementation();
    vi.mocked(accounts.getAllAccounts).mockImplementationOnce(() => {
      throw new Error('Missing required field: account.household_id');
    });
    try {
      const result = await buildFullJsonExport(createMockDb(), {
        appVersion: '0.1.0',
        generatedAt: new Date('2026-05-26T12:00:00Z'),
      });
      expect(result.accounts).toEqual([]);
      // Other repos still resolve normally.
      expect(result.transactions.length).toBeGreaterThan(0);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      if (original) vi.mocked(accounts.getAllAccounts).mockImplementation(original);
      warnSpy.mockRestore();
      // Ensure transactions mock is untouched.
      expect(vi.mocked(transactions.getAllTransactions)).toBeDefined();
    }
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
    expect(
      buildDatedExportFileName('finance-data-csv', 'zip', new Date('2026-05-26T12:00:00Z')),
    ).toBe('finance-data-csv-2026-05-26.zip');
  });

  it('builds per-entity CSV files with stable filenames and header-only output for empty entities', async () => {
    const exportData = await buildFullJsonExport(createMockDb(), {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });
    const files = buildEntityCsvFiles(exportData);
    const names = files.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'accounts.csv',
        'transactions.csv',
        'categories.csv',
        'budgets.csv',
        'goals.csv',
        'bills.csv',
        'investments.csv',
        'investment_lots.csv',
        'households.csv',
        'household_members.csv',
        'household_invitations.csv',
        'account_sharings.csv',
        'shared_budgets.csv',
        'budget_contributions.csv',
        'shared_goals.csv',
        'goal_contributions.csv',
        'preferences.csv',
        'settings.csv',
      ]),
    );

    // Every file is non-empty (at minimum a header row), even when there are
    // no records — fresh-account users can still open the file.
    for (const file of files) {
      expect(file.contents.length).toBeGreaterThan(0);
      expect(file.contents.endsWith('\r\n')).toBe(true);
    }

    const accountsCsv = files.find((file) => file.name === 'accounts.csv');
    expect(accountsCsv?.contents).toMatch(/^currency,householdId,id,name\r\n/);

    const empty = files.find((file) => file.name === 'household_invitations.csv');
    expect(empty?.contents).toBe('(empty)\r\n');
  });

  it('produces a ZIP archive containing manifest.json and per-entity CSVs', async () => {
    const exportData = await buildFullJsonExport(createMockDb(), {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });
    const zipBytes = buildAllCsvZip(exportData);

    // ZIP files always start with the "PK\003\004" local-file-header signature.
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
    expect(zipBytes[2]).toBe(0x03);
    expect(zipBytes[3]).toBe(0x04);

    // The filenames are stored in the central directory verbatim; assert a few
    // expected paths appear in the byte stream.
    const text = new TextDecoder().decode(zipBytes);
    expect(text).toContain('manifest.json');
    expect(text).toContain('accounts.csv');
    expect(text).toContain('transactions.csv');
    expect(text).toContain('preferences.csv');
  });

  it('flattens nested objects in generic CSV by JSON-stringifying values', () => {
    const csv = buildGenericCsv([
      { id: 'a-1', amount: { value: 100, currency: 'USD' }, tags: ['food', 'cash'] },
      { id: 'a-2', amount: { value: 200, currency: 'EUR' }, tags: [] },
    ]);
    const [header, row1, row2] = csv.trim().split('\r\n');
    expect(header).toBe('amount,id,tags');
    expect(row1).toContain('"{""value"":100,""currency"":""USD""}"');
    expect(row1).toContain('a-1');
    expect(row2).toContain('a-2');
  });

  it('returns an empty-marker CSV when the collection is empty', () => {
    expect(buildGenericCsv([])).toBe('(empty)\r\n');
  });

  it('builds an export manifest with scope filters', async () => {
    const exportData = await buildFullJsonExport(createMockDb(), {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });

    const manifest = buildExportManifest(exportData, {
      entities: ['transactions', 'accounts'],
      dateRange: { from: '2024-01-01', to: '2024-12-31' },
      accountIds: ['acc-1'],
    });

    expect(manifest.filters.entities).toEqual(['transactions', 'accounts']);
    expect(manifest.filters.dateRange).toEqual({ from: '2024-01-01', to: '2024-12-31' });
    expect(manifest.filters.accountIds).toEqual(['acc-1']);
  });

  it('builds a minimal XLSX workbook with one sheet per selected entity', async () => {
    const exportData = await buildFullJsonExport(createMockDb(), {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });

    const xlsx = buildXlsxWorkbook(exportData, { entities: ['transactions', 'accounts'] });
    const text = new TextDecoder().decode(xlsx);

    expect(xlsx[0]).toBe(0x50);
    expect(xlsx[1]).toBe(0x4b);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('Transactions');
    expect(text).toContain('Grocery Store');
  });

  it('builds a PDF summary with metadata and empty-data support', () => {
    const pdf = buildPdfSummary({
      transactions: [],
      accounts: [],
      categories: [],
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
      dateRange: { from: '2024-01-01', to: '2024-01-31' },
    });
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('Finance export summary');
    expect(text).toContain('Transactions: 0');
    expect(text).toContain('Date range: 2024-01-01 to 2024-01-31');
  });
});
