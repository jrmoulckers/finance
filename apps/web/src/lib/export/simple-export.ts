// SPDX-License-Identifier: BUSL-1.1

import type { SqliteDb } from '../../db/sqlite-wasm';
import { getAllAccounts } from '../../db/repositories/accounts';
import { getAllBills } from '../../db/repositories/bills';
import { getAllBudgets } from '../../db/repositories/budgets';
import { getAllCategories } from '../../db/repositories/categories';
import { getAllGoals } from '../../db/repositories/goals';
import {
  getAccountSharings,
  getBudgetContributions,
  getGoalContributions,
  getHouseholdById,
  getHouseholdInvitations,
  getHouseholdMembers,
  getSharedBudgets,
  getSharedGoals,
} from '../../db/repositories/household';
import { getAllInvestments } from '../../db/repositories/investments';
import { getLotsByInvestment } from '../../db/repositories/investment-lots';
import { getAllTransactions } from '../../db/repositories/transactions';

type HouseholdRecord = NonNullable<ReturnType<typeof getHouseholdById>>;

interface CsvAccountRecord {
  id: string;
  name: string;
}

interface CsvCategoryRecord {
  id: string;
  name: string;
}

interface CsvTransactionRecord {
  accountId: string;
  categoryId?: string | null;
  date: string;
  payee?: string | null;
  note?: string | null;
  statementDescription?: string | null;
  amount: { amount: number };
  currency: { code: string };
}

export type ExportRecord = Record<string, unknown>;

export interface FullJsonExportOptions {
  appVersion?: string;
  generatedAt?: Date;
  preferences?: readonly ExportRecord[];
  settings?: readonly ExportRecord[];
}

export interface FullJsonExport {
  schemaVersion: 1;
  generatedAt: string;
  appVersion: string | null;
  accounts: ReturnType<typeof getAllAccounts>;
  transactions: ReturnType<typeof getAllTransactions>;
  categories: ReturnType<typeof getAllCategories>;
  budgets: ReturnType<typeof getAllBudgets>;
  goals: ReturnType<typeof getAllGoals>;
  bills: ReturnType<typeof getAllBills>;
  investments: ReturnType<typeof getAllInvestments>;
  investmentLots: ReturnType<typeof getLotsByInvestment>;
  households: HouseholdRecord[];
  householdMembers: ReturnType<typeof getHouseholdMembers>;
  householdInvitations: ReturnType<typeof getHouseholdInvitations>;
  accountSharings: ReturnType<typeof getAccountSharings>;
  sharedBudgets: ReturnType<typeof getSharedBudgets>;
  budgetContributions: ReturnType<typeof getBudgetContributions>;
  sharedGoals: ReturnType<typeof getSharedGoals>;
  goalContributions: ReturnType<typeof getGoalContributions>;
  preferences: ExportRecord[];
  settings: ExportRecord[];
}

export interface TransactionsCsvInput {
  transactions: readonly CsvTransactionRecord[];
  accounts: readonly CsvAccountRecord[];
  categories: readonly CsvCategoryRecord[];
}

export function buildFullJsonExport(
  db: SqliteDb,
  options: FullJsonExportOptions = {},
): FullJsonExport {
  const accounts = readOptionalTable(() => getAllAccounts(db));
  const transactions = readOptionalTable(() => getAllTransactions(db));
  const categories = readOptionalTable(() => getAllCategories(db));
  const budgets = readOptionalTable(() => getAllBudgets(db));
  const goals = readOptionalTable(() => getAllGoals(db));
  const bills = readOptionalTable(() => getAllBills(db));
  const investments = readOptionalTable(() => getAllInvestments(db));
  const investmentLots = investments.flatMap((investment) =>
    readOptionalTable(() => getLotsByInvestment(db, investment.id)),
  );

  const householdIds = collectHouseholdIds([
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    bills,
    investments,
  ]);
  const households = householdIds
    .map((householdId) => readOptionalRecord(() => getHouseholdById(db, householdId)))
    .filter(isPresent);
  const householdMembers = households.flatMap((household) =>
    readOptionalTable(() => getHouseholdMembers(db, household.id)),
  );
  const householdInvitations = households.flatMap((household) =>
    readOptionalTable(() => getHouseholdInvitations(db, household.id)),
  );
  const accountSharings = households.flatMap((household) =>
    readOptionalTable(() => getAccountSharings(db, household.id)),
  );
  const sharedBudgets = households.flatMap((household) =>
    readOptionalTable(() => getSharedBudgets(db, household.id)),
  );
  const budgetContributions = sharedBudgets.flatMap((sharedBudget) =>
    readOptionalTable(() => getBudgetContributions(db, sharedBudget.id)),
  );
  const sharedGoals = households.flatMap((household) =>
    readOptionalTable(() => getSharedGoals(db, household.id)),
  );
  const goalContributions = sharedGoals.flatMap((sharedGoal) =>
    readOptionalTable(() => getGoalContributions(db, sharedGoal.id)),
  );

  return {
    schemaVersion: 1,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    appVersion: options.appVersion ?? null,
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    bills,
    investments,
    investmentLots,
    households,
    householdMembers,
    householdInvitations,
    accountSharings,
    sharedBudgets,
    budgetContributions,
    sharedGoals,
    goalContributions,
    preferences: [...(options.preferences ?? [])],
    settings: [...(options.settings ?? [])],
  };
}

export function serializeFullJsonExport(exportData: FullJsonExport): string {
  return `${JSON.stringify(exportData, null, 2)}\n`;
}

export function buildTransactionsCsv(input: TransactionsCsvInput): string {
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));
  const rows = [
    ['date', 'account_name', 'category_name', 'description', 'amount', 'currency'],
    ...input.transactions.map((transaction) => {
      const account = accountsById.get(transaction.accountId);
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
      return [
        transaction.date,
        account?.name ?? '',
        category?.name ?? '',
        transaction.payee ?? transaction.note ?? transaction.statementDescription ?? '',
        formatCents(transaction.amount.amount),
        transaction.currency.code,
      ];
    }),
  ];

  return `${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
}

export function buildTransactionsCsvExport(db: SqliteDb): string {
  return buildTransactionsCsv(buildFullJsonExport(db));
}

export function escapeCsvField(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildDatedExportFileName(
  prefix: string,
  extension: 'csv' | 'json',
  generatedAt = new Date(),
): string {
  return `${prefix}-${generatedAt.toISOString().slice(0, 10)}.${extension}`;
}

function readOptionalTable<T>(read: () => T[]): T[] {
  try {
    return read();
  } catch (error) {
    if (isMissingOptionalTable(error)) return [];
    throw error;
  }
}

function readOptionalRecord<T>(read: () => T | null): T | null {
  try {
    return read();
  } catch (error) {
    if (isMissingOptionalTable(error)) return null;
    throw error;
  }
}

function isMissingOptionalTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

function collectHouseholdIds(
  recordGroups: readonly (readonly { householdId?: string | null }[])[],
): string[] {
  const ids = new Set<string>();
  for (const records of recordGroups) {
    for (const record of records) {
      if (record.householdId) ids.add(record.householdId);
    }
  }
  return [...ids].sort();
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
