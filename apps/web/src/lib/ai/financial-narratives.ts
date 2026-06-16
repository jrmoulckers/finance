// SPDX-License-Identifier: BUSL-1.1

export interface NarrativeCategoryInput {
  readonly id: string;
  readonly name: string;
  readonly amountCents: number;
  readonly previousAmountCents?: number;
}

export interface NarrativeMerchantInput {
  readonly name: string;
  readonly amountCents: number;
  readonly previousAmountCents?: number;
}

export interface FinancialNarrativeInput {
  readonly periodLabel: string;
  readonly totalIncomeCents: number;
  readonly totalExpenseCents: number;
  readonly previousIncomeCents?: number;
  readonly previousExpenseCents?: number;
  readonly categories?: readonly NarrativeCategoryInput[];
  readonly merchants?: readonly NarrativeMerchantInput[];
  readonly historyMonths?: number;
}

export interface NarrativeClaim {
  readonly id: string;
  readonly tone: 'positive' | 'negative' | 'neutral';
  readonly text: string;
  readonly amountCents: number;
  readonly anchor: 'cash-flow' | 'categories' | 'merchants' | 'income' | 'spending';
  readonly importance: number;
}

export interface FinancialNarrative {
  readonly summary: string;
  readonly dataQuality: 'low' | 'medium' | 'high';
  readonly claims: readonly NarrativeClaim[];
}

function formatDollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function dataQuality(historyMonths: number | undefined, claims: readonly NarrativeClaim[]): FinancialNarrative['dataQuality'] {
  if ((historyMonths ?? 0) < 2 || claims.length < 2) return 'low';
  if ((historyMonths ?? 0) < 6) return 'medium';
  return 'high';
}

function pushClaim(claims: NarrativeClaim[], claim: NarrativeClaim | null): void {
  if (claim === null) return;
  claims.push(claim);
}

export function generateFinancialNarrative(input: FinancialNarrativeInput): FinancialNarrative {
  const claims: NarrativeClaim[] = [];
  const netCashFlow = input.totalIncomeCents - input.totalExpenseCents;
  const priorNet =
    input.previousIncomeCents === undefined || input.previousExpenseCents === undefined
      ? undefined
      : input.previousIncomeCents - input.previousExpenseCents;
  const netChange = priorNet === undefined ? null : netCashFlow - priorNet;

  pushClaim(claims, {
    id: 'cash-flow',
    tone: netCashFlow >= 0 ? 'positive' : 'negative',
    text:
      netCashFlow >= 0
        ? `Cash flow was positive by ${formatDollars(netCashFlow)}.`
        : `Cash flow was short by ${formatDollars(netCashFlow)}.`,
    amountCents: Math.abs(netCashFlow),
    anchor: 'cash-flow',
    importance: Math.abs(netCashFlow),
  });

  const spendingChange = percentChange(input.totalExpenseCents, input.previousExpenseCents);
  if (spendingChange !== null && Math.abs(spendingChange) >= 10) {
    pushClaim(claims, {
      id: 'spending-change',
      tone: spendingChange <= 0 ? 'positive' : 'negative',
      text:
        spendingChange <= 0
          ? `Spending decreased ${Math.abs(spendingChange)}% from the prior period.`
          : `Spending increased ${spendingChange}% from the prior period.`,
      amountCents: Math.abs(input.totalExpenseCents - (input.previousExpenseCents ?? 0)),
      anchor: 'spending',
      importance: Math.abs(input.totalExpenseCents - (input.previousExpenseCents ?? 0)),
    });
  }

  const incomeChange = percentChange(input.totalIncomeCents, input.previousIncomeCents);
  if (incomeChange !== null && Math.abs(incomeChange) >= 10) {
    pushClaim(claims, {
      id: 'income-change',
      tone: incomeChange >= 0 ? 'positive' : 'negative',
      text:
        incomeChange >= 0
          ? `Income rose ${incomeChange}% from the prior period.`
          : `Income fell ${Math.abs(incomeChange)}% from the prior period.`,
      amountCents: Math.abs(input.totalIncomeCents - (input.previousIncomeCents ?? 0)),
      anchor: 'income',
      importance: Math.abs(input.totalIncomeCents - (input.previousIncomeCents ?? 0)),
    });
  }

  const biggestCategory = [...(input.categories ?? [])].sort((left, right) => {
    const leftDelta = Math.abs(left.amountCents - (left.previousAmountCents ?? 0));
    const rightDelta = Math.abs(right.amountCents - (right.previousAmountCents ?? 0));
    return rightDelta - leftDelta;
  })[0];
  if (biggestCategory) {
    const delta = biggestCategory.amountCents - (biggestCategory.previousAmountCents ?? 0);
    pushClaim(claims, {
      id: `category-${biggestCategory.id}`,
      tone: delta <= 0 ? 'positive' : 'negative',
      text:
        delta >= 0
          ? `${biggestCategory.name} added ${formatDollars(delta)} versus the prior period.`
          : `${biggestCategory.name} improved by ${formatDollars(delta)} versus the prior period.`,
      amountCents: Math.abs(delta),
      anchor: 'categories',
      importance: Math.abs(delta),
    });
  }

  const biggestMerchant = [...(input.merchants ?? [])].sort((left, right) => {
    const leftDelta = Math.abs(left.amountCents - (left.previousAmountCents ?? 0));
    const rightDelta = Math.abs(right.amountCents - (right.previousAmountCents ?? 0));
    return rightDelta - leftDelta;
  })[0];
  if (biggestMerchant) {
    const delta = biggestMerchant.amountCents - (biggestMerchant.previousAmountCents ?? 0);
    pushClaim(claims, {
      id: `merchant-${biggestMerchant.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      tone: delta <= 0 ? 'positive' : 'negative',
      text:
        delta >= 0
          ? `${biggestMerchant.name} was the largest merchant increase at ${formatDollars(delta)}.`
          : `${biggestMerchant.name} decreased by ${formatDollars(delta)}.`,
      amountCents: Math.abs(delta),
      anchor: 'merchants',
      importance: Math.abs(delta),
    });
  }

  if (netChange !== null && Math.abs(netChange) > 0) {
    pushClaim(claims, {
      id: 'net-change',
      tone: netChange >= 0 ? 'positive' : 'negative',
      text:
        netChange >= 0
          ? `Net cash flow improved by ${formatDollars(netChange)}.`
          : `Net cash flow weakened by ${formatDollars(netChange)}.`,
      amountCents: Math.abs(netChange),
      anchor: 'cash-flow',
      importance: Math.abs(netChange),
    });
  }

  const orderedClaims = claims
    .filter((claim) => claim.amountCents > 0)
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 4);
  const quality = dataQuality(input.historyMonths, orderedClaims);
  const confidencePrefix =
    quality === 'low'
      ? 'With limited history, '
      : quality === 'medium'
        ? 'Based on the recent trend, '
        : 'Based on a fuller history, ';
  const mainClaim = orderedClaims[0]?.text ?? 'there was not enough activity to identify a major driver.';

  return {
    summary: `${confidencePrefix}${input.periodLabel} shows ${mainClaim.charAt(0).toLowerCase()}${mainClaim.slice(1)}`,
    dataQuality: quality,
    claims: orderedClaims,
  };
}
