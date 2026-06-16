// SPDX-License-Identifier: BUSL-1.1

import type { Category, Goal, SyncId, Transaction } from '../kmp/bridge';

export type ChoreFrequency = 'daily' | 'weekly';
export type AllowanceDay =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export interface Chore {
  id: string;
  name: string;
  value: number;
  frequency: ChoreFrequency;
  completedThisWeek: boolean;
}

export interface ChildProfile {
  id: string;
  name: string;
  age: number;
  weeklyAllowance: number;
  allowanceDay: AllowanceDay;
  balance: number;
  chores: Chore[];
  collegeFundGoalId: SyncId | null;
  createdAt: string;
  updatedAt: string;
  lastAllowanceCreditAt: string | null;
  lastChoreResetAt: string | null;
}

export interface CreateChildProfileInput {
  name: string;
  age: number;
  weeklyAllowance: number;
  allowanceDay: AllowanceDay;
  balance?: number;
  collegeFundGoalId?: SyncId | null;
}

export interface AddChildChoreInput {
  childId: string;
  name: string;
  value: number;
  frequency: ChoreFrequency;
}

export interface RecordChildWithdrawalInput {
  childId: string;
  amount: number;
}

export interface LinkChildCollegeFundInput {
  childId: string;
  goalId: SyncId;
}

export interface ChildExpenseCategoryBreakdown {
  categoryId: SyncId | null;
  categoryName: string;
  amountCents: number;
}

export interface ChildFinanceSummary {
  childId: string;
  monthSpentCents: number;
  yearSpentCents: number;
  categoryBreakdown: ChildExpenseCategoryBreakdown[];
  collegeFundGoal: Goal | null;
  collegeFundProgress: number;
}

export interface HouseholdChildFinanceRollup {
  children: Record<string, ChildFinanceSummary>;
  householdMonthSpentCents: number;
  householdYearSpentCents: number;
}

export const CHILD_TRANSACTION_CUSTOM_FIELD = 'childId';
export const CHILD_TRANSACTION_TAG_PREFIX = 'child:';

export const ALLOWANCE_DAY_OPTIONS: readonly { value: AllowanceDay; label: string }[] = [
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
];

const ALLOWANCE_DAY_INDEX: Record<AllowanceDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getCurrentWeekStart(now: Date): Date {
  const next = startOfDay(now);
  const offsetFromMonday = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - offsetFromMonday);
  return next;
}

function getNextAllowanceDate(reference: Date, allowanceDay: AllowanceDay): Date {
  const next = startOfDay(reference);
  const targetDay = ALLOWANCE_DAY_INDEX[allowanceDay];
  let offset = (targetDay - next.getDay() + 7) % 7;

  if (offset === 0) {
    offset = 7;
  }

  next.setDate(next.getDate() + offset);
  return next;
}

export function buildChildProfile(
  input: CreateChildProfileInput,
  id: string,
  now: Date = new Date(),
): ChildProfile {
  const timestamp = now.toISOString();
  return {
    id,
    name: input.name.trim(),
    age: input.age,
    weeklyAllowance: roundCurrency(input.weeklyAllowance),
    allowanceDay: input.allowanceDay,
    balance: roundCurrency(input.balance ?? 0),
    chores: [],
    collegeFundGoalId: input.collegeFundGoalId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastAllowanceCreditAt: null,
    lastChoreResetAt: getCurrentWeekStart(now).toISOString(),
  };
}

export function normalizeChildProfile(child: ChildProfile): ChildProfile {
  return {
    ...child,
    allowanceDay: child.allowanceDay ?? 'friday',
    chores: Array.isArray(child.chores)
      ? child.chores.map((chore) => ({
          ...chore,
          completedThisWeek: Boolean(chore.completedThisWeek),
        }))
      : [],
    collegeFundGoalId: child.collegeFundGoalId ?? null,
    createdAt: child.createdAt ?? new Date().toISOString(),
    updatedAt: child.updatedAt ?? child.createdAt ?? new Date().toISOString(),
    lastAllowanceCreditAt: child.lastAllowanceCreditAt ?? null,
    lastChoreResetAt: child.lastChoreResetAt ?? null,
    weeklyAllowance: roundCurrency(child.weeklyAllowance),
    balance: roundCurrency(child.balance),
  };
}

export function calculateChildWeeklyChoreEarnings(child: Pick<ChildProfile, 'chores'>): number {
  return roundCurrency(
    child.chores.reduce((total, chore) => {
      if (!chore.completedThisWeek) {
        return total;
      }

      return total + chore.value;
    }, 0),
  );
}

export function calculateAllowanceCreditsDue(
  child: Pick<
    ChildProfile,
    'allowanceDay' | 'createdAt' | 'lastAllowanceCreditAt' | 'weeklyAllowance'
  >,
  now: Date = new Date(),
): { creditsDue: number; creditedAmount: number; lastDueDate: string | null } {
  const reference = child.lastAllowanceCreditAt
    ? new Date(child.lastAllowanceCreditAt)
    : new Date(child.createdAt);

  if (Number.isNaN(reference.getTime()) || reference.getTime() > now.getTime()) {
    return { creditsDue: 0, creditedAmount: 0, lastDueDate: null };
  }

  const nextDueDate = getNextAllowanceDate(reference, child.allowanceDay);
  let creditsDue = 0;
  let lastDueDate: Date | null = null;

  while (nextDueDate.getTime() <= now.getTime()) {
    creditsDue += 1;
    lastDueDate = new Date(nextDueDate);
    nextDueDate.setDate(nextDueDate.getDate() + 7);
  }

  return {
    creditsDue,
    creditedAmount: roundCurrency(creditsDue * child.weeklyAllowance),
    lastDueDate: lastDueDate?.toISOString() ?? null,
  };
}

export function applyChildWeeklyProcessing(
  child: ChildProfile,
  now: Date = new Date(),
): ChildProfile {
  let nextChild = normalizeChildProfile(child);
  let changed = false;
  const weekStart = getCurrentWeekStart(now);
  const weekStartIso = weekStart.toISOString();

  const lastReset = nextChild.lastChoreResetAt ? new Date(nextChild.lastChoreResetAt) : null;
  if (!lastReset || lastReset.getTime() < weekStart.getTime()) {
    if (nextChild.chores.some((chore) => chore.completedThisWeek)) {
      nextChild = {
        ...nextChild,
        chores: nextChild.chores.map((chore) => ({ ...chore, completedThisWeek: false })),
      };
      changed = true;
    }

    if (nextChild.lastChoreResetAt !== weekStartIso) {
      nextChild = {
        ...nextChild,
        lastChoreResetAt: weekStartIso,
      };
      changed = true;
    }
  }

  const { creditsDue, creditedAmount, lastDueDate } = calculateAllowanceCreditsDue(nextChild, now);
  if (creditsDue > 0 && lastDueDate) {
    nextChild = {
      ...nextChild,
      balance: roundCurrency(nextChild.balance + creditedAmount),
      lastAllowanceCreditAt: lastDueDate,
    };
    changed = true;
  }

  if (changed) {
    nextChild = {
      ...nextChild,
      updatedAt: now.toISOString(),
    };
  }

  return nextChild;
}

export function applyHouseholdKidsWeeklyProcessing(
  children: ChildProfile[],
  now: Date = new Date(),
): ChildProfile[] {
  return children.map((child) => applyChildWeeklyProcessing(child, now));
}

export function toggleChoreCompletionForChildren(
  children: ChildProfile[],
  childId: string,
  choreId: string,
  now: Date = new Date(),
): ChildProfile[] {
  return applyHouseholdKidsWeeklyProcessing(children, now).map((child) => {
    if (child.id !== childId) {
      return child;
    }

    let changed = false;
    const chores = child.chores.map((chore) => {
      if (chore.id !== choreId) {
        return chore;
      }

      changed = true;
      return { ...chore, completedThisWeek: !chore.completedThisWeek };
    });

    if (!changed) {
      return child;
    }

    const originalChore = child.chores.find((chore) => chore.id === choreId);
    const delta = originalChore?.completedThisWeek
      ? -originalChore.value
      : (originalChore?.value ?? 0);

    return {
      ...child,
      chores,
      balance: roundCurrency(child.balance + delta),
      updatedAt: now.toISOString(),
    };
  });
}

export function addChoreToChildren(
  children: ChildProfile[],
  input: AddChildChoreInput,
  choreId: string,
  now: Date = new Date(),
): { children: ChildProfile[]; chore: Chore | null } {
  const newChore: Chore = {
    id: choreId,
    name: input.name.trim(),
    value: roundCurrency(input.value),
    frequency: input.frequency,
    completedThisWeek: false,
  };

  let createdChore: Chore | null = null;
  const updatedChildren = applyHouseholdKidsWeeklyProcessing(children, now).map((child) => {
    if (child.id !== input.childId) {
      return child;
    }

    createdChore = newChore;
    return {
      ...child,
      chores: [...child.chores, newChore],
      updatedAt: now.toISOString(),
    };
  });

  return {
    children: updatedChildren,
    chore: createdChore,
  };
}

export function recordChildWithdrawalForChildren(
  children: ChildProfile[],
  childId: string,
  amount: number,
  now: Date = new Date(),
): ChildProfile[] {
  return applyHouseholdKidsWeeklyProcessing(children, now).map((child) => {
    if (child.id !== childId) {
      return child;
    }

    return {
      ...child,
      balance: roundCurrency(child.balance - amount),
      updatedAt: now.toISOString(),
    };
  });
}

export function linkCollegeFundGoalForChildren(
  children: ChildProfile[],
  input: LinkChildCollegeFundInput,
  now: Date = new Date(),
): ChildProfile[] {
  return applyHouseholdKidsWeeklyProcessing(children, now).map((child) => {
    if (child.id !== input.childId) {
      return child;
    }

    return {
      ...child,
      collegeFundGoalId: input.goalId,
      updatedAt: now.toISOString(),
    };
  });
}

export function getChildTransactionTag(childId: string): string {
  return `${CHILD_TRANSACTION_TAG_PREFIX}${childId}`;
}

export function getTaggedTransactionChildId(
  transaction: Pick<Transaction, 'customFields' | 'tags'>,
): string | null {
  const customFieldChildId = transaction.customFields?.[CHILD_TRANSACTION_CUSTOM_FIELD]?.trim();
  if (customFieldChildId) {
    return customFieldChildId;
  }

  const tag = transaction.tags.find((entry) => entry.startsWith(CHILD_TRANSACTION_TAG_PREFIX));
  return tag ? tag.slice(CHILD_TRANSACTION_TAG_PREFIX.length) : null;
}

export function getChildTransactionUpdate(
  transaction: Pick<Transaction, 'customFields' | 'tags'>,
  childId: string,
): { customFields: Record<string, string>; tags: string[] } {
  const tags = transaction.tags.filter((entry) => !entry.startsWith(CHILD_TRANSACTION_TAG_PREFIX));
  tags.push(getChildTransactionTag(childId));

  return {
    customFields: {
      ...(transaction.customFields ?? {}),
      [CHILD_TRANSACTION_CUSTOM_FIELD]: childId,
    },
    tags,
  };
}

export function buildChildFinanceRollup({
  children,
  transactions,
  goals,
  categories = [],
  referenceDate = new Date(),
}: {
  children: readonly ChildProfile[];
  transactions: readonly Transaction[];
  goals: readonly Goal[];
  categories?: readonly Category[];
  referenceDate?: Date;
}): HouseholdChildFinanceRollup {
  const monthPrefix = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
  const yearPrefix = `${referenceDate.getFullYear()}-`;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const summaries = Object.fromEntries(
    children.map((child) => {
      const collegeFundGoal = child.collegeFundGoalId
        ? (goals.find((goal) => goal.id === child.collegeFundGoalId) ?? null)
        : null;
      const collegeFundProgress = collegeFundGoal?.targetAmount.amount
        ? Math.min(1, collegeFundGoal.currentAmount.amount / collegeFundGoal.targetAmount.amount)
        : 0;

      return [
        child.id,
        {
          childId: child.id,
          monthSpentCents: 0,
          yearSpentCents: 0,
          categoryBreakdown: [],
          collegeFundGoal,
          collegeFundProgress,
        } satisfies ChildFinanceSummary,
      ];
    }),
  ) as Record<string, ChildFinanceSummary>;

  const categoryTotalsByChild = new Map<string, Map<string, ChildExpenseCategoryBreakdown>>();

  transactions.forEach((transaction) => {
    if (transaction.type !== 'EXPENSE') {
      return;
    }

    const childId = getTaggedTransactionChildId(transaction);
    if (childId === null) {
      return;
    }
    const summary = summaries[childId];
    if (!summary) {
      return;
    }

    const amountCents = Math.abs(transaction.amount.amount);
    if (transaction.date.startsWith(monthPrefix)) {
      summary.monthSpentCents += amountCents;
    }
    if (transaction.date.startsWith(yearPrefix)) {
      summary.yearSpentCents += amountCents;
    }

    const categoryKey = transaction.categoryId ?? '__uncategorized__';
    const childCategoryTotals =
      categoryTotalsByChild.get(childId) ?? new Map<string, ChildExpenseCategoryBreakdown>();
    const existing = childCategoryTotals.get(categoryKey);
    const categoryName = transaction.categoryId
      ? (categoryNames.get(transaction.categoryId) ?? `Category ${transaction.categoryId}`)
      : 'Uncategorized';

    childCategoryTotals.set(categoryKey, {
      categoryId: transaction.categoryId,
      categoryName,
      amountCents: (existing?.amountCents ?? 0) + amountCents,
    });
    categoryTotalsByChild.set(childId, childCategoryTotals);
  });

  Object.entries(summaries).forEach(([childId, summary]) => {
    const categoryTotals = categoryTotalsByChild.get(childId);
    summary.categoryBreakdown = categoryTotals
      ? [...categoryTotals.values()].sort((left, right) => right.amountCents - left.amountCents)
      : [];
  });

  return {
    children: summaries,
    householdMonthSpentCents: Object.values(summaries).reduce(
      (total, summary) => total + summary.monthSpentCents,
      0,
    ),
    householdYearSpentCents: Object.values(summaries).reduce(
      (total, summary) => total + summary.yearSpentCents,
      0,
    ),
  };
}
