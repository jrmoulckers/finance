// SPDX-License-Identifier: BUSL-1.1

export interface CategoryTreeSpendCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly type?: 'expense' | 'income' | 'transfer';
  readonly deleted?: boolean;
}

export interface CategoryTreeSpendSplit {
  readonly categoryId: string;
  readonly amountCents: number;
}

export interface CategoryTreeSpendTransaction {
  readonly id: string;
  readonly categoryId?: string | null;
  readonly amountCents: number;
  readonly date: string;
  readonly kind?: 'expense' | 'income' | 'transfer';
  readonly deleted?: boolean;
  readonly splits?: readonly CategoryTreeSpendSplit[];
}

export interface CategoryTreeMonthlySpend {
  readonly categoryId: string;
  readonly monthKey: string;
  readonly amountCents: number;
}

export interface CategoryTreeSpendAggregation {
  readonly months: readonly string[];
  readonly monthlySpend: readonly CategoryTreeMonthlySpend[];
  readonly totalsByCategoryId: Readonly<Record<string, number>>;
}

function addMonths(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function ancestorIds(
  categoryId: string,
  categoryById: ReadonlyMap<string, CategoryTreeSpendCategory>,
): readonly string[] {
  const ids: string[] = [];
  let current = categoryById.get(categoryId);
  while (current && !current.deleted && current.type !== 'income' && current.type !== 'transfer') {
    ids.push(current.id);
    current = current.parentId ? categoryById.get(current.parentId) : undefined;
  }
  return ids;
}

function transactionAmounts(
  transaction: CategoryTreeSpendTransaction,
): readonly CategoryTreeSpendSplit[] {
  if (transaction.splits && transaction.splits.length > 0) return transaction.splits;
  return transaction.categoryId
    ? [{ categoryId: transaction.categoryId, amountCents: transaction.amountCents }]
    : [];
}

export function aggregateCategoryTreeMonthlySpend(input: {
  readonly categories: readonly CategoryTreeSpendCategory[];
  readonly transactions: readonly CategoryTreeSpendTransaction[];
  readonly asOfMonth: string;
  readonly lookbackMonths?: number;
}): CategoryTreeSpendAggregation {
  const lookbackMonths = input.lookbackMonths ?? 6;
  const months = Array.from({ length: lookbackMonths }, (_, index) =>
    addMonths(input.asOfMonth, index - lookbackMonths + 1),
  );
  const monthSet = new Set(months);
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();

  for (const transaction of input.transactions) {
    if (transaction.deleted || transaction.kind === 'income' || transaction.kind === 'transfer')
      continue;
    const key = monthKey(transaction.date);
    if (!monthSet.has(key)) continue;

    for (const split of transactionAmounts(transaction)) {
      const amountCents = Math.abs(Math.round(split.amountCents));
      for (const categoryId of ancestorIds(split.categoryId, categoryById)) {
        const totalKey = `${categoryId}|${key}`;
        totals.set(totalKey, (totals.get(totalKey) ?? 0) + amountCents);
      }
    }
  }

  const monthlySpend = [...totals.entries()]
    .map(([key, amountCents]) => {
      const [categoryId, month] = key.split('|');
      return { categoryId, monthKey: month, amountCents };
    })
    .sort(
      (left, right) =>
        left.categoryId.localeCompare(right.categoryId) ||
        left.monthKey.localeCompare(right.monthKey),
    );
  const totalsByCategoryId = monthlySpend.reduce<Record<string, number>>((accumulator, sample) => {
    accumulator[sample.categoryId] = (accumulator[sample.categoryId] ?? 0) + sample.amountCents;
    return accumulator;
  }, {});

  return { months, monthlySpend, totalsByCategoryId };
}
