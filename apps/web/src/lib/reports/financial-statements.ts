// SPDX-License-Identifier: BUSL-1.1

import type {
  Account,
  AccountType,
  Category,
  LocalDate,
  SyncId,
  Transaction,
} from '../../kmp/bridge';

export interface ReportPeriodOptions {
  readonly startDate?: LocalDate | null;
  readonly endDate?: LocalDate | null;
  readonly categoryIds?: readonly SyncId[];
  readonly accountIds?: readonly SyncId[];
}

export interface BalanceSheetOptions {
  readonly asOfDate?: LocalDate | null;
}

export interface FinancialReportLine {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly transactionCount: number;
}

export interface CashFlowLine extends FinancialReportLine {
  readonly group: 'Operating' | 'Discretionary' | 'Transfers';
}

export interface BalanceSheetLine {
  readonly id: string;
  readonly label: string;
  readonly accountType: AccountType;
  readonly amount: number;
}

export interface ProfitAndLossReport {
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly income: FinancialReportLine[];
  readonly expenses: FinancialReportLine[];
  readonly totalIncome: number;
  readonly totalExpenses: number;
  readonly netIncome: number;
  readonly transactionCount: number;
}

export interface CashFlowReport {
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly inflows: CashFlowLine[];
  readonly outflows: CashFlowLine[];
  readonly totalInflows: number;
  readonly totalOutflows: number;
  readonly netChangeInCash: number;
  readonly transactionCount: number;
}

export interface BalanceSheetReport {
  readonly asOfDate: LocalDate | null;
  readonly assets: BalanceSheetLine[];
  readonly liabilities: BalanceSheetLine[];
  readonly totalAssets: number;
  readonly totalLiabilities: number;
  readonly netWorth: number;
  readonly accountCount: number;
}

const UNCATEGORIZED_LABEL = 'Uncategorized';
const DISCRETIONARY_CATEGORY_TERMS = [
  'dining',
  'restaurant',
  'coffee',
  'entertainment',
  'shopping',
  'travel',
  'hobby',
  'subscription',
  'takeout',
  'delivery',
];

function isReportableTransaction(transaction: Transaction): boolean {
  return transaction.deletedAt === null && transaction.status !== 'VOID';
}

function isInPeriod(transaction: Transaction, options: ReportPeriodOptions): boolean {
  if (options.startDate && transaction.date < options.startDate) return false;
  if (options.endDate && transaction.date > options.endDate) return false;
  if (options.categoryIds && options.categoryIds.length > 0) {
    if (!transaction.categoryId || !options.categoryIds.includes(transaction.categoryId))
      return false;
  }
  if (options.accountIds && options.accountIds.length > 0) {
    if (!options.accountIds.includes(transaction.accountId)) return false;
  }
  return true;
}

function amountMagnitude(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function signedAccountEffect(transaction: Transaction): number {
  switch (transaction.type) {
    case 'INCOME':
      return amountMagnitude(transaction);
    case 'EXPENSE':
      return -amountMagnitude(transaction);
    case 'TRANSFER':
      return transaction.amount.amount;
  }
}

function categoryName(categoryId: SyncId | null, categories: readonly Category[]): string {
  if (!categoryId) return UNCATEGORIZED_LABEL;
  return (
    categories.find((category) => category.id === categoryId)?.name ?? `Category ${categoryId}`
  );
}

function addLineAmount(
  linesById: Map<string, { label: string; amount: number; transactionIds: Set<SyncId> }>,
  id: string,
  label: string,
  amount: number,
  transactionId: SyncId,
): void {
  const existing = linesById.get(id) ?? { label, amount: 0, transactionIds: new Set<SyncId>() };
  existing.amount += amount;
  existing.transactionIds.add(transactionId);
  linesById.set(id, existing);
}

function toSortedLines(
  linesById: Map<string, { label: string; amount: number; transactionIds: Set<SyncId> }>,
): FinancialReportLine[] {
  return [...linesById.entries()]
    .map(([id, line]) => ({
      id,
      label: line.label,
      amount: line.amount,
      transactionCount: line.transactionIds.size,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

function isCashAccount(account: Account | undefined): boolean {
  return account?.type === 'CHECKING' || account?.type === 'SAVINGS' || account?.type === 'CASH';
}

function isLiabilityAccount(account: Account): boolean {
  return account.type === 'CREDIT_CARD' || account.type === 'LOAN';
}

function isDiscretionaryCategory(label: string): boolean {
  const normalized = label.toLowerCase();
  return DISCRETIONARY_CATEGORY_TERMS.some((term) => normalized.includes(term));
}

export function generateProfitAndLoss(
  transactions: readonly Transaction[],
  categories: readonly Category[] = [],
  options: ReportPeriodOptions = {},
): ProfitAndLossReport {
  const incomeByCategory = new Map<
    string,
    { label: string; amount: number; transactionIds: Set<SyncId> }
  >();
  const expenseByCategory = new Map<
    string,
    { label: string; amount: number; transactionIds: Set<SyncId> }
  >();
  const reportTransactionIds = new Set<SyncId>();

  for (const transaction of transactions) {
    if (!isReportableTransaction(transaction) || !isInPeriod(transaction, options)) continue;
    if (transaction.type !== 'INCOME' && transaction.type !== 'EXPENSE') continue;

    const label = categoryName(transaction.categoryId, categories);
    const id = transaction.categoryId ?? 'uncategorized';
    const amount = amountMagnitude(transaction);

    if (transaction.type === 'INCOME') {
      addLineAmount(incomeByCategory, id, label, amount, transaction.id);
    } else {
      addLineAmount(expenseByCategory, id, label, amount, transaction.id);
    }
    reportTransactionIds.add(transaction.id);
  }

  const income = toSortedLines(incomeByCategory);
  const expenses = toSortedLines(expenseByCategory);
  const totalIncome = income.reduce((sum, line) => sum + line.amount, 0);
  const totalExpenses = expenses.reduce((sum, line) => sum + line.amount, 0);

  return {
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    netIncome: totalIncome - totalExpenses,
    transactionCount: reportTransactionIds.size,
  };
}

export function generateCashFlow(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[] = [],
  options: ReportPeriodOptions = {},
): CashFlowReport {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const inflowsByKey = new Map<
    string,
    { label: string; group: CashFlowLine['group']; amount: number; transactionIds: Set<SyncId> }
  >();
  const outflowsByKey = new Map<
    string,
    { label: string; group: CashFlowLine['group']; amount: number; transactionIds: Set<SyncId> }
  >();
  const reportTransactionIds = new Set<SyncId>();

  const addCashLine = (
    target: typeof inflowsByKey,
    key: string,
    label: string,
    group: CashFlowLine['group'],
    amount: number,
    transactionId: SyncId,
  ) => {
    const existing = target.get(key) ?? {
      label,
      group,
      amount: 0,
      transactionIds: new Set<SyncId>(),
    };
    existing.amount += amount;
    existing.transactionIds.add(transactionId);
    target.set(key, existing);
  };

  for (const transaction of transactions) {
    if (!isReportableTransaction(transaction) || !isInPeriod(transaction, options)) continue;
    const account = accountsById.get(transaction.accountId);
    if (!isCashAccount(account)) continue;

    const label = categoryName(transaction.categoryId, categories);
    const id = transaction.categoryId ?? 'uncategorized';

    if (transaction.type === 'INCOME') {
      addCashLine(
        inflowsByKey,
        `operating:${id}`,
        label,
        'Operating',
        amountMagnitude(transaction),
        transaction.id,
      );
      reportTransactionIds.add(transaction.id);
    } else if (transaction.type === 'EXPENSE') {
      const group: CashFlowLine['group'] = isDiscretionaryCategory(label)
        ? 'Discretionary'
        : 'Operating';
      addCashLine(
        outflowsByKey,
        `${group}:${id}`,
        label,
        group,
        amountMagnitude(transaction),
        transaction.id,
      );
      reportTransactionIds.add(transaction.id);
    } else {
      const effect = signedAccountEffect(transaction);
      if (effect > 0) {
        addCashLine(
          inflowsByKey,
          'transfers:transfers',
          'Transfers',
          'Transfers',
          effect,
          transaction.id,
        );
        reportTransactionIds.add(transaction.id);
      } else if (effect < 0) {
        addCashLine(
          outflowsByKey,
          'transfers:transfers',
          'Transfers',
          'Transfers',
          Math.abs(effect),
          transaction.id,
        );
        reportTransactionIds.add(transaction.id);
      }
    }
  }

  const toCashLines = (source: typeof inflowsByKey): CashFlowLine[] =>
    [...source.entries()]
      .map(([id, line]) => ({
        id,
        label: line.label,
        group: line.group,
        amount: line.amount,
        transactionCount: line.transactionIds.size,
      }))
      .sort(
        (a, b) =>
          a.group.localeCompare(b.group) || b.amount - a.amount || a.label.localeCompare(b.label),
      );

  const inflows = toCashLines(inflowsByKey);
  const outflows = toCashLines(outflowsByKey);
  const totalInflows = inflows.reduce((sum, line) => sum + line.amount, 0);
  const totalOutflows = outflows.reduce((sum, line) => sum + line.amount, 0);

  return {
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    inflows,
    outflows,
    totalInflows,
    totalOutflows,
    netChangeInCash: totalInflows - totalOutflows,
    transactionCount: reportTransactionIds.size,
  };
}

export function generateBalanceSheet(
  accounts: readonly Account[],
  transactions: readonly Transaction[] = [],
  options: BalanceSheetOptions = {},
): BalanceSheetReport {
  const transactionsByAccount = new Map<SyncId, Transaction[]>();
  for (const transaction of transactions) {
    if (!isReportableTransaction(transaction)) continue;
    const existing = transactionsByAccount.get(transaction.accountId) ?? [];
    existing.push(transaction);
    transactionsByAccount.set(transaction.accountId, existing);
  }

  const lineForAccount = (account: Account): BalanceSheetLine => {
    const futureTransactions = (transactionsByAccount.get(account.id) ?? []).filter(
      (transaction) => options.asOfDate && transaction.date > options.asOfDate,
    );
    const futureEffect = futureTransactions.reduce(
      (sum, transaction) => sum + signedAccountEffect(transaction),
      0,
    );
    const balance = account.currentBalance.amount - futureEffect;
    return {
      id: account.id,
      label: account.name,
      accountType: account.type,
      amount: isLiabilityAccount(account) ? Math.abs(balance) : balance,
    };
  };

  // Exclude archived accounts so the balance sheet reconciles with the Net
  // Worth page (computeCurrentNetWorth), which also skips archived accounts.
  const activeAccounts = accounts.filter(
    (account) => account.deletedAt === null && !account.isArchived,
  );
  const assets = activeAccounts
    .filter((account) => !isLiabilityAccount(account))
    .map(lineForAccount);
  const liabilities = activeAccounts.filter(isLiabilityAccount).map(lineForAccount);
  assets.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  liabilities.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

  const totalAssets = assets.reduce((sum, line) => sum + line.amount, 0);
  const totalLiabilities = liabilities.reduce((sum, line) => sum + line.amount, 0);

  return {
    asOfDate: options.asOfDate ?? null,
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    accountCount: activeAccounts.length,
  };
}
