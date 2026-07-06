// SPDX-License-Identifier: BUSL-1.1

export type SharedPayoffStrategy = 'avalanche' | 'snowball' | 'custom';

export interface SharedDebtInput {
  readonly id: string;
  readonly balanceCents: number;
  readonly annualRateBps: number;
  readonly minimumPaymentCents: number;
}

export interface SharedPayoffResult {
  readonly order: readonly string[];
  readonly monthsToPayoff: number;
  readonly totalInterestCents: number;
  readonly goalCashFlowFreedCents: number;
}

function monthlyInterest(balanceCents: number, annualRateBps: number): number {
  return Math.round(balanceCents * (annualRateBps / 10_000 / 12));
}

export function orderDebts(
  debts: readonly SharedDebtInput[],
  strategy: SharedPayoffStrategy,
  customOrder: readonly string[] = [],
): readonly string[] {
  if (strategy === 'custom') return customOrder;
  return [...debts]
    .sort((a, b) =>
      strategy === 'avalanche'
        ? b.annualRateBps - a.annualRateBps || a.balanceCents - b.balanceCents
        : a.balanceCents - b.balanceCents || b.annualRateBps - a.annualRateBps,
    )
    .map((debt) => debt.id);
}

export function calculateSharedPayoff(
  debts: readonly SharedDebtInput[],
  strategy: SharedPayoffStrategy,
  extraPaymentCents: number,
  customOrder: readonly string[] = [],
): SharedPayoffResult {
  const balances = new Map(debts.map((debt) => [debt.id, debt.balanceCents]));
  const debtById = new Map(debts.map((debt) => [debt.id, debt]));
  const order = orderDebts(debts, strategy, customOrder);
  const safeExtra = Math.max(0, extraPaymentCents);
  let totalInterestCents = 0;
  let monthsToPayoff = 0;
  let freedUpPaymentCents = 0;

  while ([...balances.values()].some((balance) => balance > 0) && monthsToPayoff < 600) {
    monthsToPayoff += 1;

    // Accrue interest and pay each debt's own minimum first. The extra
    // payment, minimums freed by debts cleared in earlier months, and any
    // surplus of an over-covering minimum form a pool that snowballs onto
    // debts in strategy order within this month.
    const monthInterest = new Map<string, number>();
    const monthPayment = new Map<string, number>();
    let pool = safeExtra + freedUpPaymentCents;

    for (const id of order) {
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;
      const debt = debtById.get(id)!;
      const interest = monthlyInterest(balance, debt.annualRateBps);
      totalInterestCents += interest;
      monthInterest.set(id, interest);
      const payoff = balance + interest;
      const minPayment = Math.min(debt.minimumPaymentCents, payoff);
      monthPayment.set(id, minPayment);
      pool += debt.minimumPaymentCents - minPayment;
    }

    for (const id of order) {
      if (pool <= 0) break;
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;
      const payoff = balance + (monthInterest.get(id) ?? 0);
      const already = monthPayment.get(id) ?? 0;
      const room = Math.max(0, payoff - already);
      const applied = Math.min(pool, room);
      monthPayment.set(id, already + applied);
      pool -= applied;
    }

    for (const id of order) {
      const balance = balances.get(id) ?? 0;
      if (balance <= 0) continue;
      const interest = monthInterest.get(id) ?? 0;
      const payment = monthPayment.get(id) ?? 0;
      const newBalance = Math.max(0, balance + interest - payment);
      balances.set(id, newBalance);
      // When a debt is cleared, roll its minimum into future months.
      if (newBalance <= 0 && balance > 0) {
        freedUpPaymentCents += debtById.get(id)!.minimumPaymentCents;
      }
    }
  }

  return {
    order,
    monthsToPayoff,
    totalInterestCents,
    goalCashFlowFreedCents:
      debts.reduce((sum, debt) => sum + debt.minimumPaymentCents, 0) + extraPaymentCents,
  };
}
