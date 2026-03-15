// SPDX-License-Identifier: BUSL-1.1

import { Currencies, cents, type LocalDate, type TransactionType } from '../kmp/bridge';
import { execute, queryOne, type SqliteDb } from './sqlite-wasm';
import {
  createAccount,
  createBudget,
  createCategory,
  createGoal,
  createTransaction,
} from './repositories';

interface SeedTransactionInput {
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly type: TransactionType;
  readonly amount: number;
  readonly payee: string | null;
  readonly note?: string | null;
  readonly date: LocalDate;
  readonly transferAccountId?: string | null;
  readonly tags?: readonly string[];
}

function toLocalDateString(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number): LocalDate {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return toLocalDateString(date);
}

function dateDaysFromNow(days: number): LocalDate {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return toLocalDateString(date);
}

function firstDayOfCurrentMonth(): LocalDate {
  const now = new Date();
  return toLocalDateString(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

/** Seed the local SQLite database with realistic demo data when empty. */
export async function seedDatabase(db: SqliteDb): Promise<void> {
  const existingAccounts = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM account');
  const accountCount = Number(existingAccounts?.count ?? 0);

  if (accountCount > 0) {
    return;
  }

  const seedTimestamp = new Date().toISOString();
  const userId = crypto.randomUUID();
  const householdId = crypto.randomUUID();
  const householdMemberId = crypto.randomUUID();
  const monthStart = firstDayOfCurrentMonth();

  execute(db, 'BEGIN TRANSACTION');

  try {
    execute(
      db,
      `INSERT INTO user (
        id,
        email,
        display_name,
        avatar_url,
        default_currency,
        created_at,
        updated_at,
        deleted_at,
        sync_version,
        is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        'demo@finance.local',
        'Demo User',
        null,
        Currencies.USD.code,
        seedTimestamp,
        seedTimestamp,
        null,
        1,
        0,
      ],
    );

    execute(
      db,
      `INSERT INTO household (
        id,
        name,
        owner_id,
        created_at,
        updated_at,
        deleted_at,
        sync_version,
        is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [householdId, 'Demo Household', userId, seedTimestamp, seedTimestamp, null, 1, 0],
    );

    execute(
      db,
      `INSERT INTO household_member (
        id,
        household_id,
        user_id,
        role,
        joined_at,
        created_at,
        updated_at,
        deleted_at,
        sync_version,
        is_synced
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        householdMemberId,
        householdId,
        userId,
        'OWNER',
        seedTimestamp,
        seedTimestamp,
        seedTimestamp,
        null,
        1,
        0,
      ],
    );

    const food = createCategory(db, {
      householdId,
      name: 'Food',
      icon: 'utensils',
      color: '#16A34A',
      sortOrder: 1,
    });
    const transport = createCategory(db, {
      householdId,
      name: 'Transport',
      icon: 'car',
      color: '#2563EB',
      sortOrder: 2,
    });
    const housing = createCategory(db, {
      householdId,
      name: 'Housing',
      icon: 'home',
      color: '#7C3AED',
      sortOrder: 3,
    });
    const entertainment = createCategory(db, {
      householdId,
      name: 'Entertainment',
      icon: 'film',
      color: '#DB2777',
      sortOrder: 4,
    });
    const income = createCategory(db, {
      householdId,
      name: 'Income',
      icon: 'wallet',
      color: '#059669',
      isIncome: true,
      isSystem: true,
      sortOrder: 5,
    });

    const checking = createAccount(db, {
      householdId,
      name: 'Checking',
      type: 'CHECKING',
      currency: Currencies.USD,
      currentBalance: cents(520000),
      icon: 'bank',
      color: '#2563EB',
      sortOrder: 1,
    });
    const savings = createAccount(db, {
      householdId,
      name: 'Savings',
      type: 'SAVINGS',
      currency: Currencies.USD,
      currentBalance: cents(1200000),
      icon: 'piggy-bank',
      color: '#059669',
      sortOrder: 2,
    });
    const creditCard = createAccount(db, {
      householdId,
      name: 'Credit Card',
      type: 'CREDIT_CARD',
      currency: Currencies.USD,
      currentBalance: cents(-85000),
      icon: 'credit-card',
      color: '#DC2626',
      sortOrder: 3,
    });
    const cash = createAccount(db, {
      householdId,
      name: 'Cash',
      type: 'CASH',
      currency: Currencies.USD,
      currentBalance: cents(15000),
      icon: 'wallet',
      color: '#F59E0B',
      sortOrder: 4,
    });

    const transactions: readonly SeedTransactionInput[] = [
      {
        accountId: checking.id,
        categoryId: income.id,
        type: 'INCOME',
        amount: 320000,
        payee: 'Acme Payroll',
        note: 'Biweekly paycheck',
        date: dateDaysAgo(28),
        tags: ['salary'],
      },
      {
        accountId: checking.id,
        categoryId: housing.id,
        type: 'EXPENSE',
        amount: 150000,
        payee: 'Willow Creek Apartments',
        note: 'Monthly rent',
        date: dateDaysAgo(27),
        tags: ['rent'],
      },
      {
        accountId: creditCard.id,
        categoryId: food.id,
        type: 'EXPENSE',
        amount: 18450,
        payee: 'Green Market',
        note: 'Groceries',
        date: dateDaysAgo(26),
        tags: ['groceries'],
      },
      {
        accountId: creditCard.id,
        categoryId: transport.id,
        type: 'EXPENSE',
        amount: 4550,
        payee: 'Shell',
        note: 'Fuel stop',
        date: dateDaysAgo(25),
        tags: ['fuel'],
      },
      {
        accountId: checking.id,
        categoryId: transport.id,
        type: 'EXPENSE',
        amount: 8900,
        payee: 'Metro Transit',
        note: 'Monthly pass',
        date: dateDaysAgo(22),
        tags: ['commute'],
      },
      {
        accountId: checking.id,
        categoryId: food.id,
        type: 'EXPENSE',
        amount: 6200,
        payee: 'Cafe Juniper',
        note: 'Lunch meeting',
        date: dateDaysAgo(20),
        tags: ['dining'],
      },
      {
        accountId: creditCard.id,
        categoryId: entertainment.id,
        type: 'EXPENSE',
        amount: 4100,
        payee: 'Grand Cinema',
        note: 'Movie night',
        date: dateDaysAgo(18),
        tags: ['movies'],
      },
      {
        accountId: creditCard.id,
        categoryId: entertainment.id,
        type: 'EXPENSE',
        amount: 9600,
        payee: 'Live Nation',
        note: 'Concert tickets',
        date: dateDaysAgo(15),
        tags: ['concert'],
      },
      {
        accountId: checking.id,
        categoryId: income.id,
        type: 'INCOME',
        amount: 320000,
        payee: 'Acme Payroll',
        note: 'Biweekly paycheck',
        date: dateDaysAgo(14),
        tags: ['salary'],
      },
      {
        accountId: creditCard.id,
        categoryId: food.id,
        type: 'EXPENSE',
        amount: 14275,
        payee: 'Trader Square',
        note: 'Pantry refill',
        date: dateDaysAgo(13),
        tags: ['groceries'],
      },
      {
        accountId: checking.id,
        categoryId: null,
        type: 'TRANSFER',
        amount: 50000,
        payee: 'Internal Transfer',
        note: 'Move money to savings',
        date: dateDaysAgo(12),
        transferAccountId: savings.id,
        tags: ['transfer'],
      },
      {
        accountId: cash.id,
        categoryId: food.id,
        type: 'EXPENSE',
        amount: 2375,
        payee: 'Corner Bakery',
        note: 'Coffee and pastry',
        date: dateDaysAgo(10),
        tags: ['coffee'],
      },
      {
        accountId: creditCard.id,
        categoryId: transport.id,
        type: 'EXPENSE',
        amount: 2875,
        payee: 'City Rides',
        note: 'Rideshare home',
        date: dateDaysAgo(9),
        tags: ['rideshare'],
      },
      {
        accountId: checking.id,
        categoryId: food.id,
        type: 'EXPENSE',
        amount: 9780,
        payee: 'Fresh Foods',
        note: 'Weekly groceries',
        date: dateDaysAgo(8),
        tags: ['groceries'],
      },
      {
        accountId: creditCard.id,
        categoryId: entertainment.id,
        type: 'EXPENSE',
        amount: 1899,
        payee: 'StreamBox',
        note: 'Streaming subscription',
        date: dateDaysAgo(7),
        tags: ['streaming'],
      },
      {
        accountId: checking.id,
        categoryId: housing.id,
        type: 'EXPENSE',
        amount: 6525,
        payee: 'Neighborhood Hardware',
        note: 'Home supplies',
        date: dateDaysAgo(6),
        tags: ['home'],
      },
      {
        accountId: checking.id,
        categoryId: income.id,
        type: 'INCOME',
        amount: 85000,
        payee: 'Northwind Studio',
        note: 'Freelance project payout',
        date: dateDaysAgo(4),
        tags: ['freelance'],
      },
      {
        accountId: creditCard.id,
        categoryId: food.id,
        type: 'EXPENSE',
        amount: 7350,
        payee: 'Pasta House',
        note: 'Family dinner',
        date: dateDaysAgo(3),
        tags: ['dining'],
      },
      {
        accountId: cash.id,
        categoryId: transport.id,
        type: 'EXPENSE',
        amount: 5000,
        payee: 'Transit Hub',
        note: 'Subway reload',
        date: dateDaysAgo(2),
        tags: ['commute'],
      },
      {
        accountId: creditCard.id,
        categoryId: entertainment.id,
        type: 'EXPENSE',
        amount: 4200,
        payee: 'Pixel Arcade',
        note: 'Weekend arcade night',
        date: dateDaysAgo(1),
        tags: ['fun'],
      },
    ];

    transactions.forEach((transaction) => {
      createTransaction(db, {
        householdId,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        type: transaction.type,
        amount: cents(transaction.amount),
        currency: Currencies.USD,
        payee: transaction.payee,
        note: transaction.note ?? null,
        date: transaction.date,
        transferAccountId: transaction.transferAccountId ?? null,
        tags: transaction.tags ?? [],
      });
    });

    createBudget(db, {
      householdId,
      categoryId: food.id,
      name: 'Food',
      amount: cents(50000),
      currency: Currencies.USD,
      period: 'MONTHLY',
      startDate: monthStart,
      endDate: null,
      isRollover: false,
    });
    createBudget(db, {
      householdId,
      categoryId: transport.id,
      name: 'Transport',
      amount: cents(20000),
      currency: Currencies.USD,
      period: 'MONTHLY',
      startDate: monthStart,
      endDate: null,
      isRollover: false,
    });
    createBudget(db, {
      householdId,
      categoryId: entertainment.id,
      name: 'Entertainment',
      amount: cents(15000),
      currency: Currencies.USD,
      period: 'MONTHLY',
      startDate: monthStart,
      endDate: null,
      isRollover: true,
    });

    createGoal(db, {
      householdId,
      name: 'Emergency Fund',
      targetAmount: cents(1000000),
      currentAmount: cents(300000),
      currency: Currencies.USD,
      targetDate: dateDaysFromNow(240),
      status: 'ACTIVE',
      icon: 'shield',
      color: '#059669',
      accountId: savings.id,
    });
    createGoal(db, {
      householdId,
      name: 'Vacation',
      targetAmount: cents(200000),
      currentAmount: cents(80000),
      currency: Currencies.USD,
      targetDate: dateDaysFromNow(150),
      status: 'ACTIVE',
      icon: 'plane',
      color: '#2563EB',
      accountId: checking.id,
    });

    execute(db, 'COMMIT');
  } catch (error) {
    execute(db, 'ROLLBACK');
    throw error;
  }
}
