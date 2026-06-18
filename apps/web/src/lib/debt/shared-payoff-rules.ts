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
  const order = orderDebts(debts, strategy, customOrder);
  let totalInterestCents = 0;
  let monthsToPayoff = 0;

  while ([...balances.values()].some((balance) => balance > 0) && monthsToPayoff < 600) {
    monthsToPayoff += 1;
    const activeTarget = order.find((id) => (balances.get(id) ?? 0) > 0);
    for (const debt of debts) {
      const balance = balances.get(debt.id) ?? 0;
      if (balance <= 0) continue;
      const interest = monthlyInterest(balance, debt.annualRateBps);
      totalInterestCents += interest;
      const payment = debt.minimumPaymentCents + (debt.id === activeTarget ? extraPaymentCents : 0);
      balances.set(debt.id, Math.max(0, balance + interest - payment));
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
