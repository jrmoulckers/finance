// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for Sankey money-flow data engine.
 *
 * References: issues #1584, #1724
 */

import { describe, it, expect } from 'vitest';
import {
  filterByPeriod,
  buildSankeyDiagram,
  computeAccountNetFlows,
  DEFAULT_SANKEY_CONFIG,
} from './sankey-data';
import type { SankeyTransaction } from './sankey-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(opts: {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amountCents: number;
  accountId?: string;
  accountName?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  parentCategoryId?: string | null;
  parentCategoryName?: string | null;
  isIncomeCategory?: boolean;
  date?: string;
  payee?: string | null;
}): SankeyTransaction {
  return {
    type: opts.type,
    amountCents: opts.amountCents,
    accountId: opts.accountId ?? 'acct-1',
    accountName: opts.accountName ?? 'Checking',
    categoryId: opts.categoryId ?? null,
    categoryName: opts.categoryName ?? null,
    parentCategoryId: opts.parentCategoryId ?? null,
    parentCategoryName: opts.parentCategoryName ?? null,
    isIncomeCategory: opts.isIncomeCategory ?? false,
    date: opts.date ?? '2024-06-15',
    payee: opts.payee ?? null,
  };
}

// ---------------------------------------------------------------------------
// filterByPeriod
// ---------------------------------------------------------------------------

describe('filterByPeriod', () => {
  const txs = [
    makeTx({ type: 'INCOME', amountCents: 1000, date: '2024-01-15' }),
    makeTx({ type: 'EXPENSE', amountCents: 500, date: '2024-02-10' }),
    makeTx({ type: 'EXPENSE', amountCents: 300, date: '2024-04-05' }),
    makeTx({ type: 'INCOME', amountCents: 2000, date: '2024-07-20' }),
  ];

  it('filters by month', () => {
    const result = filterByPeriod(txs, 'monthly', '2024-01-01');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
  });

  it('filters by quarter', () => {
    const result = filterByPeriod(txs, 'quarterly', '2024-01-01');
    expect(result).toHaveLength(2); // Jan + Feb
  });

  it('filters by year', () => {
    const result = filterByPeriod(txs, 'annual', '2024-01-01');
    expect(result).toHaveLength(4);
  });

  it('returns empty for no matches', () => {
    const result = filterByPeriod(txs, 'monthly', '2024-12-01');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSankeyDiagram
// ---------------------------------------------------------------------------

describe('buildSankeyDiagram', () => {
  it('returns empty diagram for no transactions', () => {
    const result = buildSankeyDiagram([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
    expect(result.totalIncomeCents).toBe(0);
    expect(result.totalExpensesCents).toBe(0);
    expect(result.netFlowCents).toBe(0);
  });

  it('creates income source nodes at level 0', () => {
    const txs = [makeTx({ type: 'INCOME', amountCents: 500000, payee: 'Employer' })];
    const result = buildSankeyDiagram(txs);

    const incomeNode = result.nodes.find((n) => n.type === 'income');
    expect(incomeNode).toBeDefined();
    expect(incomeNode?.level).toBe(0);
    expect(incomeNode?.label).toBe('Employer');
  });

  it('creates account nodes at level 1', () => {
    const txs = [
      makeTx({ type: 'INCOME', amountCents: 500000, accountId: 'a1', accountName: 'Checking' }),
    ];
    const result = buildSankeyDiagram(txs);

    const accountNode = result.nodes.find((n) => n.type === 'account');
    expect(accountNode).toBeDefined();
    expect(accountNode?.level).toBe(1);
  });

  it('creates category nodes at level 2', () => {
    const txs = [
      makeTx({
        type: 'EXPENSE',
        amountCents: 100000,
        categoryId: 'cat-food',
        categoryName: 'Food',
      }),
    ];
    const result = buildSankeyDiagram(txs);

    const catNode = result.nodes.find((n) => n.type === 'category');
    expect(catNode).toBeDefined();
    expect(catNode?.level).toBe(2);
    expect(catNode?.label).toBe('Food');
  });

  it('computes correct totals', () => {
    const txs = [
      makeTx({ type: 'INCOME', amountCents: 500000 }),
      makeTx({ type: 'EXPENSE', amountCents: 200000, categoryId: 'food', categoryName: 'Food' }),
      makeTx({ type: 'EXPENSE', amountCents: 100000, categoryId: 'rent', categoryName: 'Rent' }),
    ];
    const result = buildSankeyDiagram(txs);

    expect(result.totalIncomeCents).toBe(500000);
    expect(result.totalExpensesCents).toBe(300000);
    expect(result.netFlowCents).toBe(200000);
  });

  it('creates links between nodes', () => {
    const txs = [
      makeTx({ type: 'INCOME', amountCents: 500000, payee: 'Employer' }),
      makeTx({ type: 'EXPENSE', amountCents: 200000, categoryId: 'food', categoryName: 'Food' }),
    ];
    const result = buildSankeyDiagram(txs);

    expect(result.links.length).toBeGreaterThan(0);
    // Income -> Account link
    const incomeLink = result.links.find((l) => l.source.startsWith('income:'));
    expect(incomeLink).toBeDefined();
    expect(incomeLink?.valueCents).toBe(500000);
  });

  it('handles subcategories when enabled', () => {
    const txs = [
      makeTx({
        type: 'EXPENSE',
        amountCents: 50000,
        categoryId: 'groceries',
        categoryName: 'Groceries',
        parentCategoryId: 'food',
        parentCategoryName: 'Food',
      }),
    ];
    const result = buildSankeyDiagram(txs, { showSubcategories: true });

    const subNode = result.nodes.find((n) => n.type === 'subcategory');
    expect(subNode).toBeDefined();
    expect(subNode?.label).toBe('Groceries');
    expect(subNode?.level).toBe(3);
  });

  it('includes transfers when configured', () => {
    const txs = [makeTx({ type: 'TRANSFER', amountCents: 100000 })];
    const resultExcluded = buildSankeyDiagram(txs, { includeTransfers: false });
    expect(resultExcluded.nodes.find((n) => n.type === 'savings')).toBeUndefined();

    const resultIncluded = buildSankeyDiagram(txs, { includeTransfers: true });
    expect(resultIncluded.nodes.find((n) => n.type === 'savings')).toBeDefined();
  });

  it('computes percentOfSource on links', () => {
    const txs = [
      makeTx({ type: 'EXPENSE', amountCents: 3000, categoryId: 'a', categoryName: 'A' }),
      makeTx({ type: 'EXPENSE', amountCents: 7000, categoryId: 'b', categoryName: 'B' }),
    ];
    const result = buildSankeyDiagram(txs);

    const linkA = result.links.find((l) => l.target === 'category:a');
    const linkB = result.links.find((l) => l.target === 'category:b');
    expect(linkA?.percentOfSource).toBe(30);
    expect(linkB?.percentOfSource).toBe(70);
  });

  it('filters out zero-amount transactions', () => {
    const txs = [
      makeTx({ type: 'INCOME', amountCents: 0 }),
      makeTx({ type: 'EXPENSE', amountCents: 0 }),
    ];
    const result = buildSankeyDiagram(txs);
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
  });

  it('handles uncategorised expenses', () => {
    const txs = [
      makeTx({ type: 'EXPENSE', amountCents: 5000 }), // no category
    ];
    const result = buildSankeyDiagram(txs);

    const uncat = result.nodes.find((n) => n.label === 'Uncategorised');
    expect(uncat).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// computeAccountNetFlows
// ---------------------------------------------------------------------------

describe('computeAccountNetFlows', () => {
  it('returns empty for no transactions', () => {
    expect(computeAccountNetFlows([]).size).toBe(0);
  });

  it('computes net inflow (income - expenses)', () => {
    const txs = [
      makeTx({ type: 'INCOME', amountCents: 5000 }),
      makeTx({ type: 'EXPENSE', amountCents: 3000 }),
    ];
    const flows = computeAccountNetFlows(txs);
    const flow = flows.get('acct-1');
    expect(flow?.netFlowCents).toBe(2000);
  });

  it('handles multiple accounts', () => {
    const txs = [
      makeTx({ type: 'INCOME', amountCents: 10000, accountId: 'a1', accountName: 'Checking' }),
      makeTx({ type: 'EXPENSE', amountCents: 3000, accountId: 'a1', accountName: 'Checking' }),
      makeTx({ type: 'EXPENSE', amountCents: 5000, accountId: 'a2', accountName: 'Credit' }),
    ];
    const flows = computeAccountNetFlows(txs);

    expect(flows.get('a1')?.netFlowCents).toBe(7000);
    expect(flows.get('a2')?.netFlowCents).toBe(-5000);
  });

  it('treats transfers as zero-sum', () => {
    const txs = [makeTx({ type: 'TRANSFER', amountCents: 1000 })];
    const flows = computeAccountNetFlows(txs);
    expect(flows.get('acct-1')?.netFlowCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_SANKEY_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_SANKEY_CONFIG', () => {
  it('has expected defaults', () => {
    expect(DEFAULT_SANKEY_CONFIG.includeTransfers).toBe(false);
    expect(DEFAULT_SANKEY_CONFIG.minimumFlowCents).toBe(0);
    expect(DEFAULT_SANKEY_CONFIG.otherThresholdPercent).toBe(2);
    expect(DEFAULT_SANKEY_CONFIG.showSubcategories).toBe(false);
  });
});
