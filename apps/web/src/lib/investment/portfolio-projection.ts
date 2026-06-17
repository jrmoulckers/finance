// SPDX-License-Identifier: BUSL-1.1

export interface PortfolioHolding {
  readonly symbol: string;
  readonly marketValueCents: number;
  readonly contributionCents?: number;
}

export interface PortfolioProjectionPoint {
  readonly month: number;
  readonly endingValueCents: number;
  readonly cumulativeContributionCents: number;
  readonly cumulativeGrowthCents: number;
}

export interface EtfRollupSummary {
  readonly symbol: string;
  readonly marketValueCents: number;
  readonly contributionCents: number;
  readonly gainCents: number;
  readonly allocationPercent: number;
}

function roundCents(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0;
}

export function projectCompoundPortfolio(
  startingValueCents: number,
  monthlyContributionCents: number,
  annualReturnPercent: number,
  months: number,
): readonly PortfolioProjectionPoint[] {
  const monthlyRate = annualReturnPercent / 100 / 12;
  const points: PortfolioProjectionPoint[] = [];
  let value = startingValueCents;
  let cumulativeContributionCents = 0;
  let cumulativeGrowthCents = 0;

  for (let month = 1; month <= months; month += 1) {
    const growth = roundCents(value * monthlyRate);
    cumulativeGrowthCents += growth;
    cumulativeContributionCents += monthlyContributionCents;
    value = roundCents(value + growth + monthlyContributionCents);
    points.push({ month, endingValueCents: value, cumulativeContributionCents, cumulativeGrowthCents });
  }

  return points;
}

export function summarizeEtfRollups(holdings: readonly PortfolioHolding[]): readonly EtfRollupSummary[] {
  const total = holdings.reduce((sum, holding) => sum + holding.marketValueCents, 0);
  return holdings.map((holding) => {
    const contributionCents = holding.contributionCents ?? holding.marketValueCents;
    return {
      symbol: holding.symbol.toUpperCase(),
      marketValueCents: holding.marketValueCents,
      contributionCents,
      gainCents: holding.marketValueCents - contributionCents,
      allocationPercent: total === 0 ? 0 : Math.round((holding.marketValueCents / total) * 10000) / 100,
    };
  });
}
