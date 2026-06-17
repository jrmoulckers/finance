// SPDX-License-Identifier: BUSL-1.1

export interface NetWorthAccount {
  readonly id: string;
  readonly balanceCents: number;
  readonly kind: 'asset' | 'liability';
}

export interface NetWorthTransaction {
  readonly accountId: string;
  readonly postedDate: string;
  readonly amountCents: number;
}

export interface NetWorthPoint {
  readonly month: string;
  readonly netWorthCents: number;
}

export interface NetWorthForecastPoint extends NetWorthPoint {
  readonly contributionCents: number;
  readonly projectedGrowthCents: number;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function roundCents(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function calculateCurrentNetWorthCents(accounts: readonly NetWorthAccount[]): number {
  return accounts.reduce(
    (total, account) => total + (account.kind === 'asset' ? account.balanceCents : -account.balanceCents),
    0,
  );
}

export function buildNetWorthHistory(
  openingNetWorthCents: number,
  transactions: readonly NetWorthTransaction[],
): readonly NetWorthPoint[] {
  const monthlyDelta = new Map<string, number>();
  for (const transaction of transactions) {
    const month = monthKey(transaction.postedDate);
    monthlyDelta.set(month, (monthlyDelta.get(month) ?? 0) + transaction.amountCents);
  }

  let running = openingNetWorthCents;
  return [...monthlyDelta.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, delta]) => {
      running += delta;
      return { month, netWorthCents: running };
    });
}

export function projectNetWorth(
  startingNetWorthCents: number,
  monthlyContributionCents: number,
  annualGrowthPercent: number,
  months: number,
  startMonth: string,
): readonly NetWorthForecastPoint[] {
  const result: NetWorthForecastPoint[] = [];
  const date = new Date(`${startMonth}-01T00:00:00.000Z`);
  const monthlyRate = annualGrowthPercent / 100 / 12;
  let netWorth = startingNetWorthCents;

  for (let index = 0; index < months; index += 1) {
    const projectedGrowthCents = roundCents(Math.max(0, netWorth) * monthlyRate);
    netWorth = roundCents(netWorth + monthlyContributionCents + projectedGrowthCents);
    result.push({
      month: date.toISOString().slice(0, 7),
      netWorthCents: netWorth,
      contributionCents: monthlyContributionCents,
      projectedGrowthCents,
    });
    date.setUTCMonth(date.getUTCMonth() + 1);
  }

  return result;
}
