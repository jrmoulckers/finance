// SPDX-License-Identifier: BUSL-1.1

import type { Investment, InvestmentLot, InvestmentType, LocalDate } from '../../kmp/bridge';
import {
  ASSET_CLASS_LABELS,
  type AllocationAnalysis,
  type AssetClass,
} from '../../types/investment';
import { computeAllocation, DEFAULT_ASSET_CLASS_MAP, type HoldingWithClass } from './allocation';
import { analyzeFees, type FeeHoldingInput } from './fee-analysis';
import type { FeeAnalysis } from '../../types/investment';

export type AllocationGroupKind = 'assetClass' | 'investmentType' | 'account' | 'holding';
export type SignalSeverity = 'info' | 'warning' | 'critical';

export interface TargetAllocationBand {
  readonly assetClass: AssetClass;
  readonly targetPercent: number;
  readonly minPercent: number;
  readonly maxPercent: number;
}

export interface AllocationGroup {
  readonly key: string;
  readonly label: string;
  readonly kind: AllocationGroupKind;
  readonly valueCents: number;
  readonly percent: number;
}

export interface DiversificationSignal {
  readonly id: string;
  readonly severity: SignalSeverity;
  readonly label: string;
  readonly detail: string;
}

export interface AllocationVisualAnalysis {
  readonly totalValueCents: number;
  readonly assetClassGroups: readonly AllocationGroup[];
  readonly typeGroups: readonly AllocationGroup[];
  readonly accountGroups: readonly AllocationGroup[];
  readonly holdingGroups: readonly AllocationGroup[];
  readonly targetBands: readonly TargetAllocationBand[];
  readonly driftSignals: readonly DiversificationSignal[];
  readonly diversificationSignals: readonly DiversificationSignal[];
}

export interface RebalanceSuggestion {
  readonly assetClass: AssetClass;
  readonly label: string;
  readonly direction: 'BUY' | 'SELL';
  readonly mode: 'BUY_ONLY' | 'BUY_SELL';
  readonly amountCents: number;
  readonly currentPercent: number;
  readonly targetPercent: number;
  readonly driftPercent: number;
  readonly severity: SignalSeverity;
}

export type DividendFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

export interface DividendAssumption {
  readonly investmentId: string;
  readonly dividendPerShareCents: number;
  readonly frequency: DividendFrequency;
  readonly lastExDate: LocalDate | '';
  readonly taxClassification: string;
}

export interface DividendPaymentInput {
  readonly investmentId: string;
  readonly exDate: LocalDate;
  readonly payDate: LocalDate;
  readonly amountCents: number;
  readonly currency: string;
  readonly taxClassification: string;
}

export interface DividendForecastRow {
  readonly investmentId: string;
  readonly symbol: string;
  readonly exDate: LocalDate;
  readonly payDate: LocalDate;
  readonly amountCents: number;
  readonly currency: string;
  readonly taxClassification: string;
  readonly isProjected: boolean;
}

export interface DividendHoldingSummary {
  readonly investmentId: string;
  readonly symbol: string;
  readonly annualIncomeCents: number;
  readonly currentYieldPercent: number;
  readonly yieldOnCostPercent: number;
  readonly warning: string | null;
}

export interface DividendIncomeAnalysis {
  readonly trailingTwelveMonthIncomeCents: number;
  readonly forwardTwelveMonthIncomeCents: number;
  readonly monthlyAverageCents: number;
  readonly currentYieldPercent: number;
  readonly holdingSummaries: readonly DividendHoldingSummary[];
  readonly monthlyCalendar: readonly { month: string; amountCents: number }[];
  readonly forecastRows: readonly DividendForecastRow[];
  readonly warnings: readonly string[];
}

export interface ExpenseRatioSetting {
  readonly investmentId: string;
  readonly expenseRatioBps: number | null;
  readonly applies: boolean;
}

export interface FeeBetaAnalysis extends FeeAnalysis {
  readonly missingSymbols: readonly string[];
  readonly notApplicableSymbols: readonly string[];
  readonly nonUsdSymbols: readonly string[];
}

export interface ManualSaleInput {
  readonly investmentId: string;
  readonly saleDate: LocalDate | '';
  readonly sharesSold: number;
  readonly salePriceCents: number;
}

export interface LotBasisRow {
  readonly investmentId: string;
  readonly lotId: string;
  readonly symbol: string;
  readonly acquisitionDate: LocalDate;
  readonly shares: number;
  readonly costBasisCents: number;
  readonly currentValueCents: number;
  readonly unrealizedGainLossCents: number;
  readonly holdingPeriod: 'SHORT_TERM' | 'LONG_TERM';
  readonly warning: string | null;
}

export interface RealizedGainRow {
  readonly investmentId: string;
  readonly lotId: string;
  readonly symbol: string;
  readonly saleDate: LocalDate;
  readonly sharesSold: number;
  readonly proceedsCents: number;
  readonly basisCents: number;
  readonly gainLossCents: number;
  readonly year: number;
  readonly holdingPeriod: 'SHORT_TERM' | 'LONG_TERM';
}

export interface CostBasisAnalysis {
  readonly lotRows: readonly LotBasisRow[];
  readonly realizedGainRows: readonly RealizedGainRow[];
  readonly realizedByYear: readonly { year: number; shortTermCents: number; longTermCents: number; totalCents: number }[];
  readonly warnings: readonly string[];
}

const INVESTMENT_TYPE_LABELS: Record<InvestmentType, string> = {
  STOCK: 'Stock',
  BOND: 'Bond',
  ETF: 'ETF',
  MUTUAL_FUND: 'Mutual Fund',
  CRYPTO: 'Crypto',
  REAL_ESTATE: 'Real Estate',
  COMMODITY: 'Commodity',
  OTHER: 'Other',
};

const PAYMENTS_PER_YEAR: Record<DividendFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMI_ANNUAL: 2,
  ANNUAL: 1,
};

export const DEFAULT_TARGET_BANDS: readonly TargetAllocationBand[] = [
  { assetClass: 'US_STOCKS', targetPercent: 60, minPercent: 50, maxPercent: 70 },
  { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 20, minPercent: 10, maxPercent: 30 },
  { assetClass: 'BONDS', targetPercent: 15, minPercent: 5, maxPercent: 25 },
  { assetClass: 'REAL_ESTATE', targetPercent: 0, minPercent: 0, maxPercent: 15 },
  { assetClass: 'COMMODITIES', targetPercent: 0, minPercent: 0, maxPercent: 10 },
  { assetClass: 'CRYPTO', targetPercent: 0, minPercent: 0, maxPercent: 5 },
  { assetClass: 'CASH', targetPercent: 5, minPercent: 0, maxPercent: 15 },
  { assetClass: 'OTHER', targetPercent: 0, minPercent: 0, maxPercent: 10 },
];

export function normalizeTargetBands(
  bands: readonly TargetAllocationBand[] = DEFAULT_TARGET_BANDS,
): TargetAllocationBand[] {
  return DEFAULT_TARGET_BANDS.map((fallback) => {
    const found = bands.find((band) => band.assetClass === fallback.assetClass);
    const targetPercent = clampPercent(found?.targetPercent ?? fallback.targetPercent);
    const minPercent = clampPercent(found?.minPercent ?? Math.max(0, targetPercent - 5));
    const maxPercent = clampPercent(found?.maxPercent ?? Math.min(100, targetPercent + 5));
    return {
      assetClass: fallback.assetClass,
      targetPercent,
      minPercent: Math.min(minPercent, maxPercent),
      maxPercent: Math.max(minPercent, maxPercent),
    };
  });
}

export function buildAllocationVisualAnalysis(
  investments: readonly Investment[],
  targetBands: readonly TargetAllocationBand[] = DEFAULT_TARGET_BANDS,
): AllocationVisualAnalysis {
  const normalizedBands = normalizeTargetBands(targetBands);
  const totalValueCents = investments.reduce((sum, investment) => sum + marketValue(investment), 0);
  const assetClassGroups = buildGroups(
    investments,
    'assetClass',
    (investment) => DEFAULT_ASSET_CLASS_MAP[investment.type],
    (key) => ASSET_CLASS_LABELS[key as AssetClass] ?? key,
    totalValueCents,
  );
  const typeGroups = buildGroups(
    investments,
    'investmentType',
    (investment) => investment.type,
    (key) => INVESTMENT_TYPE_LABELS[key as InvestmentType] ?? key,
    totalValueCents,
  );
  const accountGroups = buildGroups(
    investments,
    'account',
    (investment) => investment.accountId ?? 'UNASSIGNED',
    (key) => (key === 'UNASSIGNED' ? 'Unassigned account' : `Account ${key}`),
    totalValueCents,
  );
  const holdingGroups = investments
    .map((investment) => ({
      key: investment.id,
      label: `${investment.symbol} — ${investment.name}`,
      kind: 'holding' as const,
      valueCents: marketValue(investment),
      percent: totalValueCents > 0 ? roundPercent((marketValue(investment) / totalValueCents) * 100) : 0,
    }))
    .sort(sortByValueDesc);
  const driftSignals = buildDriftSignals(assetClassGroups, normalizedBands);
  const diversificationSignals = buildDiversificationSignals(
    totalValueCents,
    assetClassGroups,
    holdingGroups,
  );

  return {
    totalValueCents,
    assetClassGroups,
    typeGroups,
    accountGroups,
    holdingGroups,
    targetBands: normalizedBands,
    driftSignals,
    diversificationSignals,
  };
}

export function computeTargetAllocationAnalysis(
  investments: readonly Investment[],
  targetBands: readonly TargetAllocationBand[],
): AllocationAnalysis {
  const holdings: HoldingWithClass[] = investments.map((investment) => ({
    symbol: investment.symbol,
    marketValue: marketValue(investment),
    assetClass: DEFAULT_ASSET_CLASS_MAP[investment.type],
  }));
  return computeAllocation(
    holdings,
    normalizeTargetBands(targetBands).map((band) => ({
      assetClass: band.assetClass,
      targetPercent: band.targetPercent,
    })),
  );
}

export function buildRebalancingSuggestions(
  analysis: AllocationAnalysis,
  cashAvailableCents: number,
  allowSellRebalancing: boolean,
  thresholdPercent = 1,
): readonly RebalanceSuggestion[] {
  if (!analysis.isTargetValid || analysis.totalPortfolioValue <= 0) return [];
  const suggestions: RebalanceSuggestion[] = [];

  if (allowSellRebalancing) {
    for (const comparison of analysis.comparisons) {
      if (Math.abs(comparison.deviationPercent) < thresholdPercent) continue;
      suggestions.push({
        assetClass: comparison.assetClass,
        label: comparison.label,
        direction: comparison.rebalanceAmount >= 0 ? 'BUY' : 'SELL',
        mode: 'BUY_SELL',
        amountCents: Math.abs(comparison.rebalanceAmount),
        currentPercent: comparison.actualPercent,
        targetPercent: comparison.targetPercent,
        driftPercent: comparison.deviationPercent,
        severity: severityForDrift(comparison.deviationPercent),
      });
    }
    return suggestions.sort((a, b) => b.amountCents - a.amountCents);
  }

  if (cashAvailableCents <= 0) return [];
  const futureTotal = analysis.totalPortfolioValue + cashAvailableCents;
  const deficits = analysis.comparisons
    .map((comparison) => ({
      comparison,
      deficitCents: Math.max(
        0,
        Math.round((comparison.targetPercent / 100) * futureTotal) - comparison.currentValue,
      ),
    }))
    .filter(({ comparison, deficitCents }) => deficitCents > 0 && comparison.deviationPercent <= -thresholdPercent);
  const totalDeficit = deficits.reduce((sum, item) => sum + item.deficitCents, 0);
  if (totalDeficit <= 0) return [];

  for (const { comparison, deficitCents } of deficits) {
    suggestions.push({
      assetClass: comparison.assetClass,
      label: comparison.label,
      direction: 'BUY',
      mode: 'BUY_ONLY',
      amountCents: Math.min(cashAvailableCents, Math.round((deficitCents / totalDeficit) * cashAvailableCents)),
      currentPercent: comparison.actualPercent,
      targetPercent: comparison.targetPercent,
      driftPercent: comparison.deviationPercent,
      severity: severityForDrift(comparison.deviationPercent),
    });
  }

  return suggestions.filter((suggestion) => suggestion.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
}

export function analyzeDividendIncome(
  investments: readonly Investment[],
  assumptions: readonly DividendAssumption[],
  payments: readonly DividendPaymentInput[] = [],
  asOfDate: LocalDate = todayIso(),
): DividendIncomeAnalysis {
  const investmentById = new Map(investments.map((investment) => [investment.id, investment]));
  const totalPortfolioValue = investments.reduce((sum, investment) => sum + marketValue(investment), 0);
  const asOf = parseIso(asOfDate);
  const trailingStart = new Date(asOf);
  trailingStart.setFullYear(trailingStart.getFullYear() - 1);
  const trailingPayments = payments.filter((payment) => {
    const payDate = parseIso(payment.payDate);
    return payDate >= trailingStart && payDate <= asOf;
  });
  const trailingTwelveMonthIncomeCents = trailingPayments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );

  const forecastRows: DividendForecastRow[] = [];
  const holdingSummaries: DividendHoldingSummary[] = [];
  const warnings: string[] = [];

  for (const investment of investments) {
    const assumption = assumptions.find((item) => item.investmentId === investment.id);
    if (!assumption || assumption.dividendPerShareCents <= 0) {
      warnings.push(`${investment.symbol} is missing dividend rate data.`);
      holdingSummaries.push({
        investmentId: investment.id,
        symbol: investment.symbol,
        annualIncomeCents: 0,
        currentYieldPercent: 0,
        yieldOnCostPercent: 0,
        warning: 'Missing dividend rate; forecast excludes this holding.',
      });
      continue;
    }

    const paymentsPerYear = PAYMENTS_PER_YEAR[assumption.frequency];
    const annualIncomeCents = Math.round(
      investment.shares * assumption.dividendPerShareCents * paymentsPerYear,
    );
    const currentValue = marketValue(investment);
    const costBasis = costBasisValue(investment);
    const warning = staleDividendWarning(investment.symbol, assumption, asOfDate);
    if (warning) warnings.push(warning);
    holdingSummaries.push({
      investmentId: investment.id,
      symbol: investment.symbol,
      annualIncomeCents,
      currentYieldPercent: currentValue > 0 ? roundPercent((annualIncomeCents / currentValue) * 100) : 0,
      yieldOnCostPercent: costBasis > 0 ? roundPercent((annualIncomeCents / costBasis) * 100) : 0,
      warning,
    });
    forecastRows.push(
      ...projectDividendRows(investment, assumption, asOfDate).map((row) => ({
        ...row,
        currency: investment.currency.code,
      })),
    );
  }

  for (const payment of payments) {
    const investment = investmentById.get(payment.investmentId);
    forecastRows.push({
      investmentId: payment.investmentId,
      symbol: investment?.symbol ?? payment.investmentId,
      exDate: payment.exDate,
      payDate: payment.payDate,
      amountCents: payment.amountCents,
      currency: payment.currency,
      taxClassification: payment.taxClassification,
      isProjected: false,
    });
  }

  forecastRows.sort((a, b) => a.payDate.localeCompare(b.payDate));
  const futureRows = forecastRows.filter((row) => row.isProjected);
  const forwardTwelveMonthIncomeCents = futureRows.reduce((sum, row) => sum + row.amountCents, 0);
  const monthlyCalendar = buildMonthlyCalendar(futureRows, asOfDate);

  return {
    trailingTwelveMonthIncomeCents,
    forwardTwelveMonthIncomeCents,
    monthlyAverageCents: Math.round(forwardTwelveMonthIncomeCents / 12),
    currentYieldPercent:
      totalPortfolioValue > 0 ? roundPercent((forwardTwelveMonthIncomeCents / totalPortfolioValue) * 100) : 0,
    holdingSummaries,
    monthlyCalendar,
    forecastRows,
    warnings,
  };
}

export function analyzeExpenseRatios(
  investments: readonly Investment[],
  settings: readonly ExpenseRatioSetting[],
  annualReturnPercent = 7,
): FeeBetaAnalysis {
  const settingById = new Map(settings.map((setting) => [setting.investmentId, setting]));
  const feeHoldings: FeeHoldingInput[] = [];
  const missingSymbols: string[] = [];
  const notApplicableSymbols: string[] = [];
  const nonUsdSymbols: string[] = [];

  for (const investment of investments) {
    const setting = settingById.get(investment.id);
    const defaultApplies = investment.type === 'ETF' || investment.type === 'MUTUAL_FUND';
    const applies = setting?.applies ?? defaultApplies;
    if (!applies) {
      notApplicableSymbols.push(investment.symbol);
      continue;
    }
    if (investment.currency.code !== 'USD') nonUsdSymbols.push(investment.symbol);
    if (setting?.expenseRatioBps == null || setting.expenseRatioBps < 0) {
      missingSymbols.push(investment.symbol);
      continue;
    }
    feeHoldings.push({
      investmentId: investment.id,
      symbol: investment.symbol,
      name: investment.name,
      expenseRatioBps: setting.expenseRatioBps,
      marketValue: marketValue(investment),
    });
  }

  return {
    ...analyzeFees(feeHoldings, annualReturnPercent),
    missingSymbols,
    notApplicableSymbols,
    nonUsdSymbols,
  };
}

export function analyzeCostBasis(
  investments: readonly Investment[],
  lotsByInvestmentId: ReadonlyMap<string, readonly InvestmentLot[]>,
  sales: readonly ManualSaleInput[] = [],
  asOfDate: LocalDate = todayIso(),
): CostBasisAnalysis {
  const investmentById = new Map(investments.map((investment) => [investment.id, investment]));
  const lotRows: LotBasisRow[] = [];
  const realizedGainRows: RealizedGainRow[] = [];
  const warnings: string[] = [];

  for (const investment of investments) {
    const lots = lotsByInvestmentId.get(investment.id) ?? [];
    const lotShareTotal = roundShares(lots.reduce((sum, lot) => sum + lot.shares, 0));
    if (lots.length === 0) {
      warnings.push(`${investment.symbol} has no tax lots; using holding-level basis only.`);
    } else if (Math.abs(lotShareTotal - investment.shares) > 0.0001) {
      warnings.push(`${investment.symbol} lot shares do not match current shares; verify splits, deleted lots, or partial sales.`);
    }

    for (const lot of lots) {
      const currentValueCents = Math.round(lot.shares * investment.currentPricePerShare.amount);
      const costBasisCents = lot.totalCost.amount || Math.round(lot.shares * lot.costPerShare.amount);
      const holdingPeriod = holdingPeriodTerm(lot.purchaseDate, asOfDate);
      lotRows.push({
        investmentId: investment.id,
        lotId: lot.id,
        symbol: investment.symbol,
        acquisitionDate: lot.purchaseDate,
        shares: lot.shares,
        costBasisCents,
        currentValueCents,
        unrealizedGainLossCents: currentValueCents - costBasisCents,
        holdingPeriod,
        warning: costBasisCents <= 0 ? 'Missing cost basis for this lot.' : null,
      });
    }
  }

  for (const sale of sales) {
    if (!sale.saleDate || sale.sharesSold <= 0 || sale.salePriceCents <= 0) continue;
    const investment = investmentById.get(sale.investmentId);
    if (!investment) continue;
    let remainingShares = sale.sharesSold;
    const lots = [...(lotsByInvestmentId.get(sale.investmentId) ?? [])].sort((a, b) =>
      a.purchaseDate.localeCompare(b.purchaseDate),
    );
    if (lots.length === 0) {
      warnings.push(`${investment.symbol} sale cannot be matched because no lots exist.`);
      continue;
    }

    for (const lot of lots) {
      if (remainingShares <= 0) break;
      const sharesSold = Math.min(remainingShares, lot.shares);
      const proceedsCents = Math.round(sharesSold * sale.salePriceCents);
      const basisCents = Math.round(sharesSold * lot.costPerShare.amount);
      const gainLossCents = proceedsCents - basisCents;
      realizedGainRows.push({
        investmentId: investment.id,
        lotId: lot.id,
        symbol: investment.symbol,
        saleDate: sale.saleDate,
        sharesSold,
        proceedsCents,
        basisCents,
        gainLossCents,
        year: Number(sale.saleDate.slice(0, 4)),
        holdingPeriod: holdingPeriodTerm(lot.purchaseDate, sale.saleDate),
      });
      remainingShares = roundShares(remainingShares - sharesSold);
    }

    if (remainingShares > 0) {
      warnings.push(`${investment.symbol} sale exceeds available FIFO lot shares by ${remainingShares.toFixed(4)} shares.`);
    }
  }

  const realizedByYear = Array.from(
    realizedGainRows.reduce((map, row) => {
      const current = map.get(row.year) ?? { year: row.year, shortTermCents: 0, longTermCents: 0, totalCents: 0 };
      const next = {
        year: row.year,
        shortTermCents:
          current.shortTermCents + (row.holdingPeriod === 'SHORT_TERM' ? row.gainLossCents : 0),
        longTermCents:
          current.longTermCents + (row.holdingPeriod === 'LONG_TERM' ? row.gainLossCents : 0),
        totalCents: current.totalCents + row.gainLossCents,
      };
      map.set(row.year, next);
      return map;
    }, new Map<number, { year: number; shortTermCents: number; longTermCents: number; totalCents: number }>()),
  )
    .map(([, value]) => value)
    .sort((a, b) => b.year - a.year);

  return { lotRows, realizedGainRows, realizedByYear, warnings };
}

function buildGroups(
  investments: readonly Investment[],
  kind: AllocationGroupKind,
  keyFor: (investment: Investment) => string,
  labelFor: (key: string) => string,
  totalValueCents: number,
): AllocationGroup[] {
  const grouped = new Map<string, number>();
  for (const investment of investments) {
    const key = keyFor(investment);
    grouped.set(key, (grouped.get(key) ?? 0) + marketValue(investment));
  }
  return Array.from(grouped.entries())
    .map(([key, valueCents]) => ({
      key,
      label: labelFor(key),
      kind,
      valueCents,
      percent: totalValueCents > 0 ? roundPercent((valueCents / totalValueCents) * 100) : 0,
    }))
    .sort(sortByValueDesc);
}

function buildDriftSignals(
  assetClassGroups: readonly AllocationGroup[],
  targetBands: readonly TargetAllocationBand[],
): DiversificationSignal[] {
  return targetBands.flatMap((band) => {
    const actualPercent = assetClassGroups.find((group) => group.key === band.assetClass)?.percent ?? 0;
    if (actualPercent >= band.minPercent && actualPercent <= band.maxPercent) return [];
    const direction = actualPercent > band.maxPercent ? 'above' : 'below';
    return [
      {
        id: `drift-${band.assetClass}`,
        severity: severityForDrift(actualPercent - band.targetPercent),
        label: `${ASSET_CLASS_LABELS[band.assetClass]} target drift`,
        detail: `${actualPercent}% is ${direction} the ${band.minPercent}%–${band.maxPercent}% target band.`,
      },
    ];
  });
}

function buildDiversificationSignals(
  totalValueCents: number,
  assetClassGroups: readonly AllocationGroup[],
  holdingGroups: readonly AllocationGroup[],
): DiversificationSignal[] {
  if (totalValueCents <= 0) {
    return [
      {
        id: 'empty-portfolio',
        severity: 'info',
        label: 'No allocation data yet',
        detail: 'Add holdings before interpreting diversification or drift signals.',
      },
    ];
  }

  const signals: DiversificationSignal[] = [];
  const topHolding = holdingGroups[0];
  if (topHolding && topHolding.percent >= 40) {
    signals.push({
      id: 'top-holding-critical',
      severity: 'critical',
      label: 'Top holding concentration',
      detail: `${topHolding.label} is ${topHolding.percent}% of the portfolio.`,
    });
  } else if (topHolding && topHolding.percent >= 25) {
    signals.push({
      id: 'top-holding-warning',
      severity: 'warning',
      label: 'Top holding concentration',
      detail: `${topHolding.label} is ${topHolding.percent}% of the portfolio.`,
    });
  }

  const topClass = assetClassGroups[0];
  if (topClass && topClass.percent >= 80) {
    signals.push({
      id: 'asset-class-critical',
      severity: 'critical',
      label: 'Single asset-class concentration',
      detail: `${topClass.label} is ${topClass.percent}% of the portfolio.`,
    });
  } else if (topClass && topClass.percent >= 65) {
    signals.push({
      id: 'asset-class-warning',
      severity: 'warning',
      label: 'Single asset-class concentration',
      detail: `${topClass.label} is ${topClass.percent}% of the portfolio.`,
    });
  }

  for (const assetClass of ['US_STOCKS', 'INTERNATIONAL_STOCKS', 'BONDS'] as const) {
    if (!assetClassGroups.some((group) => group.key === assetClass && group.valueCents > 0)) {
      signals.push({
        id: `missing-${assetClass}`,
        severity: 'info',
        label: `Missing ${ASSET_CLASS_LABELS[assetClass]}`,
        detail: `${ASSET_CLASS_LABELS[assetClass]} do not appear in current holdings.`,
      });
    }
  }

  return signals;
}

function projectDividendRows(
  investment: Investment,
  assumption: DividendAssumption,
  asOfDate: LocalDate,
): Omit<DividendForecastRow, 'currency'>[] {
  const rows: Omit<DividendForecastRow, 'currency'>[] = [];
  const asOf = parseIso(asOfDate);
  const endDate = new Date(asOf);
  endDate.setFullYear(endDate.getFullYear() + 1);
  let nextDate = assumption.lastExDate ? parseIso(assumption.lastExDate) : new Date(asOf);
  const monthsBetween = 12 / PAYMENTS_PER_YEAR[assumption.frequency];

  for (let index = 0; index < PAYMENTS_PER_YEAR[assumption.frequency] + 3; index += 1) {
    while (nextDate <= asOf) {
      nextDate = addMonths(nextDate, monthsBetween);
    }
    if (nextDate > endDate) break;
    const payDate = new Date(nextDate);
    payDate.setDate(payDate.getDate() + 30);
    rows.push({
      investmentId: investment.id,
      symbol: investment.symbol,
      exDate: toIso(nextDate),
      payDate: toIso(payDate),
      amountCents: Math.round(investment.shares * assumption.dividendPerShareCents),
      taxClassification: assumption.taxClassification || 'Unspecified',
      isProjected: true,
    });
    nextDate = addMonths(nextDate, monthsBetween);
  }

  return rows;
}

function buildMonthlyCalendar(
  rows: readonly DividendForecastRow[],
  asOfDate: LocalDate,
): Array<{ month: string; amountCents: number }> {
  const asOf = parseIso(asOfDate);
  return Array.from({ length: 12 }, (_unused, index) => {
    const monthDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + index, 1));
    const month = monthDate.toISOString().slice(0, 7);
    return {
      month,
      amountCents: rows
        .filter((row) => row.payDate.startsWith(month))
        .reduce((sum, row) => sum + row.amountCents, 0),
    };
  });
}

function staleDividendWarning(
  symbol: string,
  assumption: DividendAssumption,
  asOfDate: LocalDate,
): string | null {
  if (!assumption.lastExDate) return `${symbol} dividend forecast uses an assumed schedule because no ex-date is set.`;
  const ageDays = daysBetween(assumption.lastExDate, asOfDate);
  if (ageDays > 370) return `${symbol} dividend ex-date is over a year old; verify the rate before relying on the forecast.`;
  return null;
}

function marketValue(investment: Investment): number {
  return Math.round(investment.shares * investment.currentPricePerShare.amount);
}

function costBasisValue(investment: Investment): number {
  return Math.round(investment.shares * investment.costBasisPerShare.amount);
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundShares(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}

function severityForDrift(driftPercent: number): SignalSeverity {
  const absolute = Math.abs(driftPercent);
  if (absolute >= 15) return 'critical';
  if (absolute >= 5) return 'warning';
  return 'info';
}

function sortByValueDesc(a: AllocationGroup, b: AllocationGroup): number {
  return b.valueCents - a.valueCents;
}

function parseIso(date: LocalDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIso(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

function todayIso(): LocalDate {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function daysBetween(startDate: LocalDate, endDate: LocalDate): number {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function holdingPeriodTerm(acquisitionDate: LocalDate, saleOrAsOfDate: LocalDate): 'SHORT_TERM' | 'LONG_TERM' {
  return daysBetween(acquisitionDate, saleOrAsOfDate) > 365 ? 'LONG_TERM' : 'SHORT_TERM';
}
