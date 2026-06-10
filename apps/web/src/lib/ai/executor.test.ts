// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteDb } from '../../db/sqlite-wasm';
import { executeFinancialQuery } from './executor';
import type { ParsedFinancialQuery } from './types';

vi.mock('../../db/sqlite-wasm', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/sqlite-wasm';

const mockQuery = vi.mocked(query);
const mockDb = {} as SqliteDb;
const now = new Date('2026-05-26T12:00:00Z');

function makeParsedQuery(overrides: Partial<ParsedFinancialQuery>): ParsedFinancialQuery {
  return {
    rawQuery: 'test query',
    normalizedQuery: 'test query',
    confidence: 0.9,
    matchedPhrases: [],
    intent: 'spending_summary',
    entities: {},
    ...overrides,
  };
}

describe('executeFinancialQuery', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('builds a parameterized spending summary query with category and date filters', () => {
    mockQuery.mockReturnValue({
      columns: [],
      rows: [
        {
          total_amount: 12345,
          average_amount: 4115,
          transaction_count: 3,
          currency: 'USD',
        },
      ],
    });

    const result = executeFinancialQuery(
      mockDb,
      makeParsedQuery({
        intent: 'spending_summary',
        entities: {
          category: 'Groceries',
          timeRange: {
            preset: 'last-month',
            label: 'last month',
            startDate: '2026-04-01',
            endDate: '2026-04-30',
          },
        },
      }),
      { now },
    );

    expect(result.intent).toBe('spending_summary');
    expect(result.data.totalCents).toBe(12345);
    expect(result.plan.sql).toContain('t.type = ?');
    expect(result.plan.sql).toContain("LOWER(COALESCE(c.name, '')) LIKE ?");
    expect(result.plan.sql).toContain('t.date >= ?');
    expect(result.plan.sql).toContain('t.date <= ?');
    expect(result.plan.params).toEqual(['EXPENSE', '2026-04-01', '2026-04-30', '%groceries%']);
  });

  it('orders transaction searches by largest amount and respects the threshold and limit', () => {
    mockQuery.mockReturnValue({
      columns: [],
      rows: [
        {
          id: 'txn-1',
          date: '2026-05-20',
          description: 'Laptop Store',
          category_name: 'Shopping',
          account_name: 'Checking',
          amount: -250000,
          absolute_amount: 250000,
          currency: 'USD',
          type: 'EXPENSE',
        },
      ],
    });

    const result = executeFinancialQuery(
      mockDb,
      makeParsedQuery({
        intent: 'transaction_search',
        entities: {
          amountThreshold: { operator: 'gte', amountCents: 10000, label: 'over $100.00' },
          limit: 3,
          timeRange: {
            preset: 'this-year',
            label: 'this year',
            startDate: '2026-01-01',
            endDate: '2026-05-26',
          },
        },
      }),
      { now },
    );

    expect(result.intent).toBe('transaction_search');
    expect(result.data.rows[0]).toMatchObject({
      description: 'Laptop Store',
      absoluteAmountCents: 250000,
    });
    expect(result.plan.sql).toContain('ABS(t.amount) >= ?');
    expect(result.plan.sql).toContain('ORDER BY ABS(t.amount) DESC');
    expect(result.plan.sql).toContain('LIMIT ?');
    expect(result.plan.params).toEqual(['2026-01-01', '2026-05-26', 10000, 3]);
  });

  it('computes goal progress and on-track status', () => {
    mockQuery.mockReturnValue({
      columns: [],
      rows: [
        {
          id: 'goal-1',
          goal_name: 'Emergency Fund',
          current_amount: 400000,
          target_amount: 1000000,
          currency: 'USD',
          status: 'ACTIVE',
          target_date: '2026-12-31',
          created_at: '2026-01-01T00:00:00Z',
          account_name: 'Savings',
        },
      ],
    });

    const result = executeFinancialQuery(
      mockDb,
      makeParsedQuery({
        intent: 'goal_progress',
        entities: { goalName: 'Emergency Fund' },
      }),
      { now },
    );

    expect(result.intent).toBe('goal_progress');
    expect(result.data.rows[0]).toMatchObject({
      goalName: 'Emergency Fund',
      percentComplete: 40,
      remainingAmountCents: 600000,
      onTrack: true,
    });
    expect(result.plan.sql).toContain('FROM goal g');
    expect(result.plan.sql).toContain('LOWER(g.name) LIKE ?');
    expect(result.plan.params).toEqual(['%emergency fund%']);
  });

  it('calculates budget status percentages from budget rows', () => {
    mockQuery.mockReturnValue({
      columns: [],
      rows: [
        {
          id: 'budget-1',
          budget_name: 'Groceries',
          category_name: 'Groceries',
          budget_amount: 50000,
          spent_amount: 45000,
          currency: 'USD',
        },
      ],
    });

    const result = executeFinancialQuery(
      mockDb,
      makeParsedQuery({
        intent: 'budget_status',
        entities: {},
      }),
      { now },
    );

    expect(result.intent).toBe('budget_status');
    expect(result.data.rows[0]).toMatchObject({
      budgetName: 'Groceries',
      percentUsed: 90,
      remainingAmountCents: 5000,
      status: 'warning',
    });
    expect(result.plan.params).toEqual(['2026-05-01', '2026-05-26', '2026-05-26', '2026-05-01']);
  });

  it('summarizes monthly trends and averages', () => {
    mockQuery.mockReturnValue({
      columns: [],
      rows: [
        { period: '2026-03', total_amount: 100000, currency: 'USD' },
        { period: '2026-04', total_amount: 120000, currency: 'USD' },
        { period: '2026-05', total_amount: 150000, currency: 'USD' },
      ],
    });

    const result = executeFinancialQuery(
      mockDb,
      makeParsedQuery({
        intent: 'trend_analysis',
        entities: {
          analysisMode: 'average',
          metric: 'spending',
          timeRange: {
            preset: 'rolling-months',
            label: 'last 3 months',
            startDate: '2026-03-01',
            endDate: '2026-05-26',
          },
        },
      }),
      { now },
    );

    expect(result.intent).toBe('trend_analysis');
    expect(result.data.averageMonthlyCents).toBe(123333);
    expect(result.data.changePercent).toBeCloseTo(25, 3);
    expect(result.data.trendDirection).toBe('up');
    expect(result.plan.sql).toContain('GROUP BY SUBSTR(t.date, 1, 7)');
    expect(result.plan.params).toEqual(['EXPENSE', '2026-03-01', '2026-05-26']);
  });
});
