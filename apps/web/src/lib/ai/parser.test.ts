// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { parseFinancialQuery } from './parser';
import { QUERY_SUGGESTION_GROUPS } from './types';

const now = new Date('2026-05-26T12:00:00Z');
const knownCategories = ['Groceries', 'Dining', 'Travel'];
const knownAccounts = ['Checking', 'Savings'];
const knownBudgets = ['Groceries', 'Dining Out'];
const knownGoals = ['Emergency Fund', 'Vacation Fund'];

const parserOptions = {
  now,
  knownCategories,
  knownAccounts,
  knownBudgets,
  knownGoals,
};

describe('parseFinancialQuery', () => {
  it('extracts a spending summary with category and last-month time range', () => {
    const parsed = parseFinancialQuery(
      'How much did I spend on groceries last month?',
      parserOptions,
    );

    expect(parsed.intent).toBe('spending_summary');
    expect(parsed.entities.category).toBe('Groceries');
    expect(parsed.entities.timeRange).toMatchObject({
      label: 'last month',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    expect(parsed.confidence).toBeGreaterThan(0.5);
  });

  it('detects income summary phrasing', () => {
    const parsed = parseFinancialQuery('What did I earn from checking this year?', parserOptions);

    expect(parsed.intent).toBe('income_summary');
    expect(parsed.entities.account).toBe('Checking');
    expect(parsed.entities.timeRange?.label).toBe('this year');
  });

  it('recognizes category breakdown questions', () => {
    const parsed = parseFinancialQuery(
      'Break down my spending by category this month',
      parserOptions,
    );

    expect(parsed.intent).toBe('category_breakdown');
    expect(parsed.entities.timeRange?.label).toBe('this month');
  });

  it('captures transaction search limits and time ranges', () => {
    const parsed = parseFinancialQuery(
      'Show me my largest 3 transactions this year',
      parserOptions,
    );

    expect(parsed.intent).toBe('transaction_search');
    expect(parsed.entities.limit).toBe(3);
    expect(parsed.entities.timeRange?.label).toBe('this year');
  });

  it('captures amount thresholds for transaction searches', () => {
    const parsed = parseFinancialQuery('Find transactions over $100 last month', parserOptions);

    expect(parsed.intent).toBe('transaction_search');
    expect(parsed.entities.amountThreshold).toEqual({
      operator: 'gte',
      amountCents: 10000,
      label: 'over $100.00',
    });
  });

  it('recognizes goal progress queries', () => {
    const parsed = parseFinancialQuery('Am I on track with my emergency fund goal?', parserOptions);

    expect(parsed.intent).toBe('goal_progress');
    expect(parsed.entities.goalName).toBe('Emergency Fund');
  });

  it('recognizes budget status queries', () => {
    const parsed = parseFinancialQuery('How is my groceries budget this month?', parserOptions);

    expect(parsed.intent).toBe('budget_status');
    expect(parsed.entities.budgetName).toBe('Groceries');
    expect(parsed.entities.timeRange?.label).toBe('this month');
  });

  it('recognizes trend analysis and average mode', () => {
    const parsed = parseFinancialQuery("What's my average monthly spending?", parserOptions);

    expect(parsed.intent).toBe('trend_analysis');
    expect(parsed.entities.analysisMode).toBe('average');
    expect(parsed.entities.metric).toBe('spending');
  });

  it('ships at least four example phrasings for every supported query intent', () => {
    expect(QUERY_SUGGESTION_GROUPS).toHaveLength(7);
    for (const group of QUERY_SUGGESTION_GROUPS) {
      expect(group.examples.length).toBeGreaterThanOrEqual(4);
    }
  });
});
