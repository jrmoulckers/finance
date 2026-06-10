// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryEngine } from './QueryEngine';

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: vi.fn(() => ({
    exec: vi.fn(),
    selectAll: vi.fn(),
    selectOne: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../../hooks', () => ({
  useCategories: vi.fn(() => ({
    categories: [{ id: 'cat-1', name: 'Groceries' }],
    loading: false,
  })),
  useAccounts: vi.fn(() => ({ accounts: [{ id: 'acc-1', name: 'Checking' }], loading: false })),
  useBudgets: vi.fn(() => ({ budgets: [{ id: 'budget-1', name: 'Groceries' }], loading: false })),
  useGoals: vi.fn(() => ({ goals: [{ id: 'goal-1', name: 'Emergency Fund' }], loading: false })),
}));

vi.mock('../../lib/ai/parser', () => ({
  parseFinancialQuery: vi.fn(() => ({
    rawQuery: 'How much did I spend on groceries last month?',
    normalizedQuery: 'how much did i spend on groceries last month',
    intent: 'spending_summary',
    confidence: 0.9,
    matchedPhrases: ['spent'],
    entities: { category: 'Groceries' },
  })),
}));

vi.mock('../../lib/ai/executor', () => ({
  executeFinancialQuery: vi.fn(() => ({
    intent: 'spending_summary',
    parsedQuery: {
      rawQuery: 'How much did I spend on groceries last month?',
      normalizedQuery: 'how much did i spend on groceries last month',
      intent: 'spending_summary',
      confidence: 0.9,
      matchedPhrases: ['spent'],
      entities: { category: 'Groceries' },
    },
    plan: { sql: 'select 1', params: [], description: 'Summarize spending' },
    data: {
      totalCents: 12345,
      averageCents: 6172,
      transactionCount: 2,
      currency: 'USD',
      timeRangeLabel: 'last month',
      category: 'Groceries',
    },
  })),
}));

vi.mock('../../lib/ai/formatter', () => ({
  formatFinancialQueryResponse: vi.fn(() => ({
    title: 'Spending summary',
    summary: 'You spent $123.45 on groceries last month.',
    highlights: [
      { label: 'Total spent', value: '$123.45' },
      { label: 'Transactions', value: '2' },
    ],
    details: ['Category filter: Groceries'],
  })),
}));

describe('QueryEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the local query dialog from the floating action button', async () => {
    const user = userEvent.setup();
    render(<QueryEngine />);

    await user.click(screen.getByRole('button', { name: /ask finance ai/i }));

    expect(
      screen.getByRole('dialog', { name: /ai natural language query engine/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/rule-based parser/i)).toBeInTheDocument();
  });

  it('submits a typed natural-language question and renders a response card', async () => {
    const user = userEvent.setup();
    render(<QueryEngine />);

    await user.click(screen.getByRole('button', { name: /ask finance ai/i }));
    await user.type(
      screen.getByLabelText(/ask a question about your finances/i),
      'How much did I spend on groceries last month?',
    );
    await user.click(screen.getByRole('button', { name: /^ask$/i }));

    expect(
      screen.getAllByText('You spent $123.45 on groceries last month.').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Category filter: Groceries')).toBeInTheDocument();
    expect(screen.getByText('Total spent')).toBeInTheDocument();
  });

  it('runs a quick-action chip immediately', async () => {
    const user = userEvent.setup();
    render(<QueryEngine />);

    await user.click(screen.getByRole('button', { name: /ask finance ai/i }));
    await user.click(screen.getByRole('button', { name: /how much did i spend last month/i }));

    expect(screen.getByText('Spending summary')).toBeInTheDocument();
    expect(screen.getAllByText(/you spent \$123\.45/i).length).toBeGreaterThan(0);
  });
});
