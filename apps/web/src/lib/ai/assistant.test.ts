// SPDX-License-Identifier: BUSL-1.1

import {
  ASSISTANT_PRIVACY_COPY,
  answerFinancialQuestion,
  extractAssistantDateRange,
  parseAssistantQuestion,
  type AssistantData,
} from './assistant';

const data: AssistantData = {
  today: '2026-03-15',
  accounts: [
    { id: 'checking', name: 'Checking', balanceCents: 120_000 },
    { id: 'card', name: 'Credit card', balanceCents: -20_000 },
  ],
  transactions: [
    {
      id: 't1',
      date: '2026-03-05',
      amountCents: -4_250,
      type: 'expense',
      merchant: 'Fresh Market',
      category: 'Groceries',
    },
    {
      id: 't2',
      date: '2026-03-12',
      amountCents: -2_100,
      type: 'expense',
      merchant: 'Target',
      category: 'Household',
    },
    {
      id: 't3',
      date: '2026-02-20',
      amountCents: -1_600,
      type: 'expense',
      merchant: 'Fresh Market',
      category: 'Groceries',
    },
  ],
  budgets: [
    {
      id: 'b1',
      name: 'Dining',
      category: 'Dining',
      amountCents: 30_000,
      spentCents: 18_000,
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    },
  ],
  goals: [{ id: 'g1', name: 'Emergency fund', currentCents: 50_000, targetCents: 100_000 }],
  bills: [
    {
      id: 'rent',
      merchant: 'Rent',
      nextDueDate: '2026-04-01',
      expectedAmountCents: 150_000,
      confidence: 0.92,
    },
  ],
};

describe('assistant local Q&A', () => {
  it('parses supported intents and date ranges', () => {
    expect(
      parseAssistantQuestion('How much did I spend on groceries this month?', '2026-03-15'),
    ).toMatchObject({ intent: 'category_spending', entity: 'groceries' });
    expect(extractAssistantDateRange('spending last month', '2026-03-15')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
      label: 'last month',
    });
  });

  it('calculates net worth from local account balances', () => {
    expect(answerFinancialQuestion('What is my net worth?', data).answer).toContain('$1000.00');
  });

  it('calculates category spending inside the requested range', () => {
    const answer = answerFinancialQuestion('How much did I spend on groceries this month?', data);
    expect(answer.answer).toContain('$42.50');
    expect(answer.sources).toContain('1 matching transactions');
  });

  it('finds the most recent merchant transaction', () => {
    expect(answerFinancialQuestion('When did I last visit Target?', data).answer).toContain(
      '2026-03-12',
    );
  });

  it('summarizes budget pace, goal progress, and upcoming bills', () => {
    expect(answerFinancialQuestion('How is my dining budget pacing?', data).answer).toContain(
      'Dining',
    );
    expect(answerFinancialQuestion('How is my emergency fund goal?', data).answer).toContain(
      '50% funded',
    );
    expect(answerFinancialQuestion('What bills are coming up?', data).answer).toContain(
      'Rent on 2026-04-01',
    );
  });

  it('does not hallucinate unsupported prompts and includes privacy copy', () => {
    const answer = answerFinancialQuestion('Should I buy a house tomorrow?', data);
    expect(answer.intent).toBe('unsupported');
    expect(answer.examples).toContain('What is my net worth?');
    expect(answer.sources).toContain(ASSISTANT_PRIVACY_COPY);
  });
});
