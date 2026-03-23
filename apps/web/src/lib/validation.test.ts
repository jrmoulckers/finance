import { describe, expect, it } from 'vitest';

import {
  accountSchema,
  budgetSchema,
  goalSchema,
  loginSchema,
  signupSchema,
  transactionSchema,
} from './validation';

describe('transactionSchema', () => {
  const validTransaction = {
    description: 'Groceries',
    amount: 42.5,
    type: 'EXPENSE' as const,
    categoryId: 'category-1',
    accountId: 'account-1',
    date: '2026-03-16',
    notes: 'Weekly shop',
  };

  it('accepts valid transaction data', () => {
    expect(transactionSchema.safeParse(validTransaction).success).toBe(true);
  });

  it('rejects an empty description', () => {
    expect(transactionSchema.safeParse({ ...validTransaction, description: '' }).success).toBe(
      false,
    );
  });

  it('rejects a non-positive amount', () => {
    expect(transactionSchema.safeParse({ ...validTransaction, amount: 0 }).success).toBe(false);
  });

  it('rejects a missing category', () => {
    expect(transactionSchema.safeParse({ ...validTransaction, categoryId: '' }).success).toBe(
      false,
    );
  });

  it('rejects a missing account', () => {
    expect(transactionSchema.safeParse({ ...validTransaction, accountId: '' }).success).toBe(false);
  });

  it('rejects a missing date', () => {
    expect(transactionSchema.safeParse({ ...validTransaction, date: '' }).success).toBe(false);
  });
});

describe('accountSchema', () => {
  const validAccount = {
    name: 'Checking',
    type: 'CHECKING' as const,
    currencyCode: 'USD',
    initialBalance: 1000,
  };

  it('accepts valid account data', () => {
    expect(accountSchema.safeParse(validAccount).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(accountSchema.safeParse({ ...validAccount, name: '' }).success).toBe(false);
  });

  it('rejects an unsupported account type', () => {
    expect(accountSchema.safeParse({ ...validAccount, type: 'BROKERAGE' }).success).toBe(false);
  });

  it('rejects a short currency code', () => {
    expect(accountSchema.safeParse({ ...validAccount, currencyCode: 'US' }).success).toBe(false);
  });

  it('rejects a negative initial balance', () => {
    expect(accountSchema.safeParse({ ...validAccount, initialBalance: -1 }).success).toBe(false);
  });
});

describe('budgetSchema', () => {
  const validBudget = {
    categoryId: 'category-1',
    amount: 250,
    period: 'MONTHLY' as const,
  };

  it('accepts valid budget data', () => {
    expect(budgetSchema.safeParse(validBudget).success).toBe(true);
  });

  it('rejects a missing category', () => {
    expect(budgetSchema.safeParse({ ...validBudget, categoryId: '' }).success).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    expect(budgetSchema.safeParse({ ...validBudget, amount: -5 }).success).toBe(false);
  });

  it('rejects an unsupported period', () => {
    expect(budgetSchema.safeParse({ ...validBudget, period: 'DAILY' }).success).toBe(false);
  });
});

describe('goalSchema', () => {
  const validGoal = {
    name: 'Emergency fund',
    targetAmount: 10000,
    currentAmount: 500,
    targetDate: '2026-12-31',
    description: 'Build cash reserves',
  };

  it('accepts valid goal data', () => {
    expect(goalSchema.safeParse(validGoal).success).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(goalSchema.safeParse({ ...validGoal, name: '' }).success).toBe(false);
  });

  it('rejects a non-positive target amount', () => {
    expect(goalSchema.safeParse({ ...validGoal, targetAmount: 0 }).success).toBe(false);
  });

  it('rejects a negative current amount', () => {
    expect(goalSchema.safeParse({ ...validGoal, currentAmount: -1 }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  const validLogin = {
    email: 'user@example.com',
    password: 'password123',
  };

  it('accepts valid login data', () => {
    expect(loginSchema.safeParse(validLogin).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(loginSchema.safeParse({ ...validLogin, email: 'invalid' }).success).toBe(false);
  });

  it('rejects a short password', () => {
    expect(loginSchema.safeParse({ ...validLogin, password: 'short' }).success).toBe(false);
  });
});

describe('signupSchema', () => {
  const validSignup = {
    email: 'user@example.com',
    password: 'password123',
    confirmPassword: 'password123',
  };

  it('accepts valid signup data', () => {
    expect(signupSchema.safeParse(validSignup).success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = signupSchema.safeParse({ ...validSignup, confirmPassword: 'password456' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
    }
  });

  it('rejects an invalid email', () => {
    expect(signupSchema.safeParse({ ...validSignup, email: 'invalid' }).success).toBe(false);
  });
});
