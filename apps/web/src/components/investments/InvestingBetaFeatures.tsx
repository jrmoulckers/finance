// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Checkbox } from '../common/Checkbox';
import type { Investment, InvestmentLot, SyncId } from '../../kmp/bridge';
import {
  analyzeCostBasis,
  analyzeDividendIncome,
  analyzeExpenseRatios,
  buildAllocationVisualAnalysis,
  buildRebalancingSuggestions,
  computeTargetAllocationAnalysis,
  DEFAULT_TARGET_BANDS,
  normalizeTargetBands,
  type CostBasisAnalysis,
  type DividendAssumption,
  type DividendIncomeAnalysis,
  type ExpenseRatioSetting,
  type FeeBetaAnalysis,
  type ManualSaleInput,
  type RebalanceSuggestion,
  type TargetAllocationBand,
} from '../../lib/investment/beta-features';
import { ASSET_CLASS_LABELS, type AssetClass } from '../../types/investment';
interface BetaIncomeExportRow extends Record<string, unknown> {
  readonly symbol?: string;
  readonly date?: string;
  readonly paymentDate?: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly type?: string;
  readonly category?: string;
  readonly description?: string;
}

interface BetaRealizedGainExportRow extends Record<string, unknown> {
  readonly symbol?: string;
  readonly soldDate?: string;
  readonly proceeds?: number;
  readonly basis?: number;
  readonly term?: string;
  readonly gainLoss?: number;
}

interface UseInvestingBetaFeaturesArgs {
  readonly investments: readonly Investment[];
  readonly getLots: (investmentId: SyncId) => InvestmentLot[];
}

export interface InvestingBetaFeaturesState {
  readonly targetBands: readonly TargetAllocationBand[];
  readonly setTargetPercent: (assetClass: AssetClass, targetPercent: number) => void;
  readonly applyPreset: (presetName: BetaPresetName) => void;
  readonly cashAvailableCents: number;
  readonly setCashAvailableCents: (value: number) => void;
  readonly allowSellRebalancing: boolean;
  readonly setAllowSellRebalancing: (value: boolean) => void;
  readonly dividendAssumptions: readonly DividendAssumption[];
  readonly updateDividendAssumption: (
    investmentId: string,
    updates: Partial<DividendAssumption>,
  ) => void;
  readonly expenseRatioSettings: readonly ExpenseRatioSetting[];
  readonly updateExpenseRatioSetting: (
    investmentId: string,
    updates: Partial<ExpenseRatioSetting>,
  ) => void;
  readonly manualSales: readonly ManualSaleInput[];
  readonly updateManualSale: (investmentId: string, updates: Partial<ManualSaleInput>) => void;
  readonly allocation: ReturnType<typeof buildAllocationVisualAnalysis>;
  readonly rebalanceSuggestions: readonly RebalanceSuggestion[];
  readonly dividendAnalysis: DividendIncomeAnalysis;
  readonly feeAnalysis: FeeBetaAnalysis;
  readonly costBasisAnalysis: CostBasisAnalysis;
  readonly dividendExportRows: readonly BetaIncomeExportRow[];
  readonly realizedGainExportRows: readonly BetaRealizedGainExportRow[];
}

type BetaPresetName = 'growth' | 'balanced' | 'income';

const TARGET_STORAGE_KEY = 'finance.investingBeta.targetBands.v1';
const CASH_STORAGE_KEY = 'finance.investingBeta.cashAvailableCents.v1';
const SELL_STORAGE_KEY = 'finance.investingBeta.allowSellRebalancing.v1';
const DIVIDEND_STORAGE_KEY = 'finance.investingBeta.dividendAssumptions.v1';
const FEE_STORAGE_KEY = 'finance.investingBeta.expenseRatios.v1';
const SALE_STORAGE_KEY = 'finance.investingBeta.manualSales.v1';

const TARGET_PRESETS: Record<BetaPresetName, readonly TargetAllocationBand[]> = {
  growth: [
    { assetClass: 'US_STOCKS', targetPercent: 65, minPercent: 55, maxPercent: 75 },
    { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 25, minPercent: 15, maxPercent: 35 },
    { assetClass: 'BONDS', targetPercent: 5, minPercent: 0, maxPercent: 15 },
    { assetClass: 'REAL_ESTATE', targetPercent: 0, minPercent: 0, maxPercent: 15 },
    { assetClass: 'COMMODITIES', targetPercent: 0, minPercent: 0, maxPercent: 10 },
    { assetClass: 'CRYPTO', targetPercent: 0, minPercent: 0, maxPercent: 5 },
    { assetClass: 'CASH', targetPercent: 5, minPercent: 0, maxPercent: 15 },
    { assetClass: 'OTHER', targetPercent: 0, minPercent: 0, maxPercent: 10 },
  ],
  balanced: DEFAULT_TARGET_BANDS,
  income: [
    { assetClass: 'US_STOCKS', targetPercent: 35, minPercent: 25, maxPercent: 45 },
    { assetClass: 'INTERNATIONAL_STOCKS', targetPercent: 15, minPercent: 5, maxPercent: 25 },
    { assetClass: 'BONDS', targetPercent: 35, minPercent: 25, maxPercent: 45 },
    { assetClass: 'REAL_ESTATE', targetPercent: 5, minPercent: 0, maxPercent: 15 },
    { assetClass: 'COMMODITIES', targetPercent: 0, minPercent: 0, maxPercent: 10 },
    { assetClass: 'CRYPTO', targetPercent: 0, minPercent: 0, maxPercent: 5 },
    { assetClass: 'CASH', targetPercent: 10, minPercent: 0, maxPercent: 20 },
    { assetClass: 'OTHER', targetPercent: 0, minPercent: 0, maxPercent: 10 },
  ],
};

export function useInvestingBetaFeatures({
  investments,
  getLots,
}: UseInvestingBetaFeaturesArgs): InvestingBetaFeaturesState {
  const [targetBands, setTargetBands] = useStoredState(
    TARGET_STORAGE_KEY,
    normalizeTargetBands(DEFAULT_TARGET_BANDS),
  );
  const [cashAvailableCents, setCashAvailableCents] = useStoredState(CASH_STORAGE_KEY, 0);
  const [allowSellRebalancing, setAllowSellRebalancing] = useStoredState(SELL_STORAGE_KEY, false);
  const [dividendAssumptions, setDividendAssumptions] = useStoredState<DividendAssumption[]>(
    DIVIDEND_STORAGE_KEY,
    [],
  );
  const [expenseRatioSettings, setExpenseRatioSettings] = useStoredState<ExpenseRatioSetting[]>(
    FEE_STORAGE_KEY,
    [],
  );
  const [manualSales, setManualSales] = useStoredState<ManualSaleInput[]>(SALE_STORAGE_KEY, []);

  const lotsByInvestmentId = useMemo(
    () => new Map(investments.map((investment) => [investment.id, getLots(investment.id)])),
    [getLots, investments],
  );

  const normalizedTargetBands = useMemo(() => normalizeTargetBands(targetBands), [targetBands]);
  const allocation = useMemo(
    () => buildAllocationVisualAnalysis(investments, normalizedTargetBands),
    [investments, normalizedTargetBands],
  );
  const targetAnalysis = useMemo(
    () => computeTargetAllocationAnalysis(investments, normalizedTargetBands),
    [investments, normalizedTargetBands],
  );
  const rebalanceSuggestions = useMemo(
    () => buildRebalancingSuggestions(targetAnalysis, cashAvailableCents, allowSellRebalancing),
    [allowSellRebalancing, cashAvailableCents, targetAnalysis],
  );
  const dividendAnalysis = useMemo(
    () => analyzeDividendIncome(investments, dividendAssumptions),
    [dividendAssumptions, investments],
  );
  const feeAnalysis = useMemo(
    () => analyzeExpenseRatios(investments, expenseRatioSettings),
    [expenseRatioSettings, investments],
  );
  const costBasisAnalysis = useMemo(
    () => analyzeCostBasis(investments, lotsByInvestmentId, manualSales),
    [investments, lotsByInvestmentId, manualSales],
  );

  const setTargetPercent = useCallback(
    (assetClass: AssetClass, targetPercent: number) => {
      setTargetBands((current) =>
        normalizeTargetBands(current).map((band) =>
          band.assetClass === assetClass
            ? {
                ...band,
                targetPercent,
                minPercent: Math.max(0, targetPercent - 5),
                maxPercent: Math.min(100, targetPercent + 5),
              }
            : band,
        ),
      );
    },
    [setTargetBands],
  );

  const applyPreset = useCallback(
    (presetName: BetaPresetName) =>
      setTargetBands(normalizeTargetBands(TARGET_PRESETS[presetName])),
    [setTargetBands],
  );

  const updateDividendAssumption = useCallback(
    (investmentId: string, updates: Partial<DividendAssumption>) => {
      setDividendAssumptions((current) =>
        upsert(current, investmentId, defaultDividendAssumption(investmentId), updates),
      );
    },
    [setDividendAssumptions],
  );

  const updateExpenseRatioSetting = useCallback(
    (investmentId: string, updates: Partial<ExpenseRatioSetting>) => {
      setExpenseRatioSettings((current) =>
        upsert(current, investmentId, defaultExpenseRatioSetting(investmentId), updates),
      );
    },
    [setExpenseRatioSettings],
  );

  const updateManualSale = useCallback(
    (investmentId: string, updates: Partial<ManualSaleInput>) => {
      setManualSales((current) =>
        upsert(current, investmentId, defaultManualSale(investmentId), updates),
      );
    },
    [setManualSales],
  );

  const dividendExportRows = useMemo(
    () =>
      dividendAnalysis.forecastRows.map((row) => ({
        symbol: row.symbol,
        date: row.payDate,
        paymentDate: row.payDate,
        amount: row.amountCents,
        currency: row.currency,
        type: row.isProjected ? 'Projected dividend' : 'Dividend',
        category: row.taxClassification,
        description: `${row.isProjected ? 'Projected' : 'Manual'} dividend; ex-date ${row.exDate}`,
      })),
    [dividendAnalysis.forecastRows],
  );
  const realizedGainExportRows = useMemo(
    () =>
      costBasisAnalysis.realizedGainRows.map((row) => ({
        symbol: row.symbol,
        soldDate: row.saleDate,
        proceeds: row.proceedsCents,
        basis: row.basisCents,
        term: row.holdingPeriod === 'LONG_TERM' ? 'LT' : 'ST',
        gainLoss: row.gainLossCents,
      })),
    [costBasisAnalysis.realizedGainRows],
  );

  return {
    targetBands: normalizedTargetBands,
    setTargetPercent,
    applyPreset,
    cashAvailableCents,
    setCashAvailableCents,
    allowSellRebalancing,
    setAllowSellRebalancing,
    dividendAssumptions,
    updateDividendAssumption,
    expenseRatioSettings,
    updateExpenseRatioSetting,
    manualSales,
    updateManualSale,
    allocation,
    rebalanceSuggestions,
    dividendAnalysis,
    feeAnalysis,
    costBasisAnalysis,
    dividendExportRows,
    realizedGainExportRows,
  };
}

export const InvestingBetaFeaturesPanel: React.FC<{
  readonly investments: readonly Investment[];
  readonly features: InvestingBetaFeaturesState;
}> = ({ investments, features }) => {
  const targetTotal = features.targetBands.reduce((sum, band) => sum + band.targetPercent, 0);

  return (
    <section className="page-section" aria-label="Investing beta features">
      <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h3 style={{ fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-4)' }}>
          Investing Beta Toolkit
        </h3>
        <p style={{ color: 'var(--semantic-text-secondary)' }}>
          Educational estimates only. Verify taxes, transaction costs, dividend data, and fund fees
          before trading.
        </p>

        <AllocationSection features={features} targetTotal={targetTotal} />
        <RebalancingSection features={features} targetTotal={targetTotal} />
        <DividendSection investments={investments} features={features} />
        <CostBasisSection investments={investments} features={features} />
        <FeeSection investments={investments} features={features} />
      </div>
    </section>
  );
};

const AllocationSection: React.FC<{
  readonly features: InvestingBetaFeaturesState;
  readonly targetTotal: number;
}> = ({ features, targetTotal }) => (
  <section aria-labelledby="allocation-beta-heading" style={{ marginTop: 'var(--spacing-6)' }}>
    <h4 id="allocation-beta-heading">Asset allocation visuals and target bands</h4>
    <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => features.applyPreset('growth')}>
        Growth preset
      </button>
      <button type="button" onClick={() => features.applyPreset('balanced')}>
        Balanced preset
      </button>
      <button type="button" onClick={() => features.applyPreset('income')}>
        Income preset
      </button>
    </div>
    <p className="sr-only" aria-live="polite">
      Allocation summary:{' '}
      {features.allocation.assetClassGroups
        .map((group) => `${group.label} ${group.percent}%`)
        .join(', ')}
    </p>
    {targetTotal !== 100 && (
      <p role="alert" style={{ color: 'var(--semantic-warning, #d97706)' }}>
        Target allocations total {targetTotal}%; rebalancing suggestions require exactly 100%.
      </p>
    )}
    <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-3)' }}>
      <table aria-label="Target allocation inputs and drift" style={tableStyle}>
        <thead>
          <tr>
            <TableHeader text="Asset class" />
            <TableHeader text="Current" align="right" />
            <TableHeader text="Target" align="right" />
            <TableHeader text="Band" />
          </tr>
        </thead>
        <tbody>
          {features.targetBands.map((band) => {
            const current =
              features.allocation.assetClassGroups.find((group) => group.key === band.assetClass)
                ?.percent ?? 0;
            return (
              <tr key={band.assetClass}>
                <TableCell>{ASSET_CLASS_LABELS[band.assetClass]}</TableCell>
                <TableCell align="right">{current}%</TableCell>
                <TableCell align="right">
                  <label>
                    <span className="sr-only">
                      Target percent for {ASSET_CLASS_LABELS[band.assetClass]}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={band.targetPercent}
                      onChange={(event) =>
                        features.setTargetPercent(band.assetClass, Number(event.target.value))
                      }
                      style={{ width: 72, textAlign: 'right' }}
                    />
                    %
                  </label>
                </TableCell>
                <TableCell>
                  {band.minPercent}%–{band.maxPercent}%
                </TableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <AllocationTables features={features} />
    <SignalList
      title="Diversification and drift signals"
      signals={[...features.allocation.diversificationSignals, ...features.allocation.driftSignals]}
    />
  </section>
);

const AllocationTables: React.FC<{ readonly features: InvestingBetaFeaturesState }> = ({
  features,
}) => (
  <div style={responsiveGridStyle}>
    <CompactAllocationTable title="By asset class" rows={features.allocation.assetClassGroups} />
    <CompactAllocationTable title="By investment type" rows={features.allocation.typeGroups} />
    <CompactAllocationTable title="By account" rows={features.allocation.accountGroups} />
    <CompactAllocationTable title="By holding" rows={features.allocation.holdingGroups} />
  </div>
);

const RebalancingSection: React.FC<{
  readonly features: InvestingBetaFeaturesState;
  readonly targetTotal: number;
}> = ({ features, targetTotal }) => (
  <section aria-labelledby="rebalancing-heading" style={{ marginTop: 'var(--spacing-6)' }}>
    <h4 id="rebalancing-heading">Rebalancing suggestions</h4>
    <div
      style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap', alignItems: 'center' }}
    >
      <label>
        New cash available
        <input
          type="number"
          min={0}
          step={50}
          value={features.cashAvailableCents / 100}
          onChange={(event) =>
            features.setCashAvailableCents(Math.round(Number(event.target.value) * 100))
          }
          style={{ marginLeft: 'var(--spacing-2)', width: 120 }}
        />
      </label>
      <Checkbox
        label="Enable sell-based rebalancing"
        checked={features.allowSellRebalancing}
        onChange={(event) => features.setAllowSellRebalancing(event.target.checked)}
      />
    </div>
    <p style={{ color: 'var(--semantic-text-secondary)' }}>
      Buy-only mode allocates new cash toward underweight classes. Sell suggestions are hidden
      unless explicitly enabled.
    </p>
    {targetTotal !== 100 ? (
      <p role="alert">Set target allocations to exactly 100% to generate suggestions.</p>
    ) : features.rebalanceSuggestions.length === 0 ? (
      <p>No rebalance trades exceed the 1% drift threshold with current settings.</p>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table aria-label="Rebalancing suggestions" style={tableStyle}>
          <thead>
            <tr>
              <TableHeader text="Asset class" />
              <TableHeader text="Action" />
              <TableHeader text="Amount" align="right" />
              <TableHeader text="Current vs target" />
              <TableHeader text="Severity" />
            </tr>
          </thead>
          <tbody>
            {features.rebalanceSuggestions.map((suggestion) => (
              <tr key={`${suggestion.mode}-${suggestion.assetClass}`}>
                <TableCell>{suggestion.label}</TableCell>
                <TableCell>{suggestion.direction === 'BUY' ? 'Buy' : 'Sell'}</TableCell>
                <TableCell align="right">
                  <MoneyDisplay amount={suggestion.amountCents} />
                </TableCell>
                <TableCell>
                  {suggestion.currentPercent}% vs {suggestion.targetPercent}%
                </TableCell>
                <TableCell>{severityLabel(suggestion.severity)}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

const DividendSection: React.FC<{
  readonly investments: readonly Investment[];
  readonly features: InvestingBetaFeaturesState;
}> = ({ investments, features }) => (
  <section aria-labelledby="dividend-heading" style={{ marginTop: 'var(--spacing-6)' }}>
    <h4 id="dividend-heading">Dividend tracking and income forecast</h4>
    <SummaryGrid>
      <Metric
        label="Trailing 12-month income"
        value={<MoneyDisplay amount={features.dividendAnalysis.trailingTwelveMonthIncomeCents} />}
      />
      <Metric
        label="Forward 12-month forecast"
        value={<MoneyDisplay amount={features.dividendAnalysis.forwardTwelveMonthIncomeCents} />}
      />
      <Metric
        label="Monthly average"
        value={<MoneyDisplay amount={features.dividendAnalysis.monthlyAverageCents} />}
      />
      <Metric label="Current yield" value={`${features.dividendAnalysis.currentYieldPercent}%`} />
    </SummaryGrid>
    <div style={{ overflowX: 'auto' }}>
      <table aria-label="Manual dividend assumptions" style={tableStyle}>
        <thead>
          <tr>
            <TableHeader text="Holding" />
            <TableHeader text="Dividend/share" align="right" />
            <TableHeader text="Frequency" />
            <TableHeader text="Last ex-date" />
            <TableHeader text="Tax class" />
            <TableHeader text="Yield" align="right" />
          </tr>
        </thead>
        <tbody>
          {investments.map((investment) => {
            const assumption =
              features.dividendAssumptions.find((item) => item.investmentId === investment.id) ??
              defaultDividendAssumption(investment.id);
            const summary = features.dividendAnalysis.holdingSummaries.find(
              (item) => item.investmentId === investment.id,
            );
            return (
              <tr key={investment.id}>
                <TableCell>{investment.symbol}</TableCell>
                <TableCell align="right">
                  <input
                    aria-label={`Dividend per share for ${investment.symbol}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={assumption.dividendPerShareCents / 100}
                    onChange={(event) =>
                      features.updateDividendAssumption(investment.id, {
                        dividendPerShareCents: Math.round(Number(event.target.value) * 100),
                      })
                    }
                    style={{ width: 96, textAlign: 'right' }}
                  />
                </TableCell>
                <TableCell>
                  <select
                    aria-label={`Dividend frequency for ${investment.symbol}`}
                    value={assumption.frequency}
                    onChange={(event) =>
                      features.updateDividendAssumption(investment.id, {
                        frequency: event.target.value as DividendAssumption['frequency'],
                      })
                    }
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="SEMI_ANNUAL">Semi-annual</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </TableCell>
                <TableCell>
                  <input
                    aria-label={`Last ex-date for ${investment.symbol}`}
                    type="date"
                    value={assumption.lastExDate}
                    onChange={(event) =>
                      features.updateDividendAssumption(investment.id, {
                        lastExDate: event.target.value,
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <input
                    aria-label={`Tax classification for ${investment.symbol}`}
                    value={assumption.taxClassification}
                    onChange={(event) =>
                      features.updateDividendAssumption(investment.id, {
                        taxClassification: event.target.value,
                      })
                    }
                    style={{ width: 140 }}
                  />
                </TableCell>
                <TableCell align="right">{summary?.currentYieldPercent ?? 0}%</TableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <CompactCalendar features={features} />
    <SignalList
      title="Dividend data warnings"
      signals={features.dividendAnalysis.warnings.map((warning, index) => ({
        id: `dividend-${index}`,
        severity: 'info' as const,
        label: 'Dividend assumption',
        detail: warning,
      }))}
    />
  </section>
);

const CostBasisSection: React.FC<{
  readonly investments: readonly Investment[];
  readonly features: InvestingBetaFeaturesState;
}> = ({ investments, features }) => (
  <section aria-labelledby="cost-basis-heading" style={{ marginTop: 'var(--spacing-6)' }}>
    <h4 id="cost-basis-heading">Cost basis and realized gains</h4>
    <div style={{ overflowX: 'auto' }}>
      <table aria-label="Manual FIFO sell transactions" style={tableStyle}>
        <thead>
          <tr>
            <TableHeader text="Holding" />
            <TableHeader text="Sale date" />
            <TableHeader text="Shares sold" align="right" />
            <TableHeader text="Sale price" align="right" />
          </tr>
        </thead>
        <tbody>
          {investments.map((investment) => {
            const sale =
              features.manualSales.find((item) => item.investmentId === investment.id) ??
              defaultManualSale(investment.id);
            return (
              <tr key={investment.id}>
                <TableCell>{investment.symbol}</TableCell>
                <TableCell>
                  <input
                    aria-label={`Sale date for ${investment.symbol}`}
                    type="date"
                    value={sale.saleDate}
                    onChange={(event) =>
                      features.updateManualSale(investment.id, { saleDate: event.target.value })
                    }
                  />
                </TableCell>
                <TableCell align="right">
                  <input
                    aria-label={`Shares sold for ${investment.symbol}`}
                    type="number"
                    min={0}
                    step={0.0001}
                    value={sale.sharesSold}
                    onChange={(event) =>
                      features.updateManualSale(investment.id, {
                        sharesSold: Number(event.target.value),
                      })
                    }
                    style={{ width: 96, textAlign: 'right' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <input
                    aria-label={`Sale price for ${investment.symbol}`}
                    type="number"
                    min={0}
                    step={0.01}
                    value={sale.salePriceCents / 100}
                    onChange={(event) =>
                      features.updateManualSale(investment.id, {
                        salePriceCents: Math.round(Number(event.target.value) * 100),
                      })
                    }
                    style={{ width: 96, textAlign: 'right' }}
                  />
                </TableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-3)' }}>
      <table aria-label="Lot-level cost basis" style={tableStyle}>
        <thead>
          <tr>
            <TableHeader text="Lot" />
            <TableHeader text="Acquired" />
            <TableHeader text="Shares" align="right" />
            <TableHeader text="Cost basis" align="right" />
            <TableHeader text="Current value" align="right" />
            <TableHeader text="Unrealized" align="right" />
            <TableHeader text="Holding period" />
          </tr>
        </thead>
        <tbody>
          {features.costBasisAnalysis.lotRows.length === 0 ? (
            <tr>
              <TableCell colSpan={7}>
                No lots are available yet; add lots to see lot-level basis.
              </TableCell>
            </tr>
          ) : (
            features.costBasisAnalysis.lotRows.map((row) => (
              <tr key={row.lotId}>
                <TableCell>{row.symbol}</TableCell>
                <TableCell>{row.acquisitionDate}</TableCell>
                <TableCell align="right">{row.shares}</TableCell>
                <TableCell align="right">
                  <MoneyDisplay amount={row.costBasisCents} />
                </TableCell>
                <TableCell align="right">
                  <MoneyDisplay amount={row.currentValueCents} />
                </TableCell>
                <TableCell align="right">
                  {formatSignedMoney(row.unrealizedGainLossCents)}
                </TableCell>
                <TableCell>
                  {row.holdingPeriod === 'LONG_TERM' ? 'Long term' : 'Short term'}
                </TableCell>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
    <RealizedGainsTable features={features} />
    <SignalList
      title="Cost-basis warnings"
      signals={features.costBasisAnalysis.warnings.map((warning, index) => ({
        id: `basis-${index}`,
        severity: 'warning' as const,
        label: 'Basis guardrail',
        detail: warning,
      }))}
    />
  </section>
);

const FeeSection: React.FC<{
  readonly investments: readonly Investment[];
  readonly features: InvestingBetaFeaturesState;
}> = ({ investments, features }) => {
  const sortedInvestments = [...investments].sort((left, right) => {
    const leftFee = features.feeAnalysis.summary.fundFees.find(
      (item) => item.investmentId === left.id,
    );
    const rightFee = features.feeAnalysis.summary.fundFees.find(
      (item) => item.investmentId === right.id,
    );
    const leftSetting = features.expenseRatioSettings.find((item) => item.investmentId === left.id);
    const rightSetting = features.expenseRatioSettings.find(
      (item) => item.investmentId === right.id,
    );
    return (
      (rightFee?.annualFee ?? 0) - (leftFee?.annualFee ?? 0) ||
      (rightSetting?.expenseRatioBps ?? 0) - (leftSetting?.expenseRatioBps ?? 0)
    );
  });

  return (
    <section aria-labelledby="fee-heading" style={{ marginTop: 'var(--spacing-6)' }}>
      <h4 id="fee-heading">Expense-ratio and fee analysis</h4>
      <SummaryGrid>
        <Metric
          label="Annual fee drag"
          value={<MoneyDisplay amount={features.feeAnalysis.summary.totalAnnualFees} />}
        />
        <Metric
          label="Weighted expense ratio"
          value={`${features.feeAnalysis.summary.weightedExpenseRatioBps / 100}%`}
        />
        <Metric
          label="30-year projected fees"
          value={
            <MoneyDisplay
              amount={
                features.feeAnalysis.projections.find((item) => item.years === 30)?.totalFeesPaid ??
                0
              }
            />
          }
        />
      </SummaryGrid>
      <div style={{ overflowX: 'auto' }}>
        <table aria-label="Expense ratio inputs and comparison" style={tableStyle}>
          <thead>
            <tr>
              <TableHeader text="Holding" />
              <TableHeader text="Applies" />
              <TableHeader text="Expense ratio" align="right" />
              <TableHeader text="Annual fee" align="right" />
            </tr>
          </thead>
          <tbody>
            {sortedInvestments.map((investment) => {
              const defaultApplies = investment.type === 'ETF' || investment.type === 'MUTUAL_FUND';
              const setting =
                features.expenseRatioSettings.find((item) => item.investmentId === investment.id) ??
                defaultExpenseRatioSetting(investment.id, defaultApplies);
              const fee = features.feeAnalysis.summary.fundFees.find(
                (item) => item.investmentId === investment.id,
              );
              return (
                <tr key={investment.id}>
                  <TableCell>{investment.symbol}</TableCell>
                  <TableCell>
                    <Checkbox
                      aria-label={`Fees apply to ${investment.symbol}`}
                      checked={setting.applies}
                      onChange={(event) =>
                        features.updateExpenseRatioSetting(investment.id, {
                          applies: event.target.checked,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell align="right">
                    <input
                      aria-label={`Expense ratio for ${investment.symbol}`}
                      type="number"
                      min={0}
                      step={0.01}
                      value={(setting.expenseRatioBps ?? 0) / 100}
                      onChange={(event) =>
                        features.updateExpenseRatioSetting(investment.id, {
                          expenseRatioBps: Math.round(Number(event.target.value) * 100),
                        })
                      }
                      style={{ width: 96, textAlign: 'right' }}
                    />
                    %
                  </TableCell>
                  <TableCell align="right">
                    <MoneyDisplay amount={fee?.annualFee ?? 0} />
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-3)' }}>
        <table aria-label="Fee drag projections" style={tableStyle}>
          <thead>
            <tr>
              <TableHeader text="Horizon" />
              <TableHeader text="Value without fees" align="right" />
              <TableHeader text="Value with fees" align="right" />
              <TableHeader text="Estimated fees" align="right" />
            </tr>
          </thead>
          <tbody>
            {features.feeAnalysis.projections.map((projection) => (
              <tr key={projection.years}>
                <TableCell>{projection.years} years</TableCell>
                <TableCell align="right">
                  <MoneyDisplay amount={projection.valueWithoutFees} />
                </TableCell>
                <TableCell align="right">
                  <MoneyDisplay amount={projection.valueWithFees} />
                </TableCell>
                <TableCell align="right">
                  <MoneyDisplay amount={projection.totalFeesPaid} />
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SignalList
        title="Fee data warnings"
        signals={[
          ...features.feeAnalysis.missingSymbols.map((symbol) => ({
            id: `missing-${symbol}`,
            severity: 'warning' as const,
            label: 'Missing expense ratio',
            detail: `${symbol} is fee-bearing but has no expense ratio.`,
          })),
          ...features.feeAnalysis.notApplicableSymbols.map((symbol) => ({
            id: `not-applicable-${symbol}`,
            severity: 'info' as const,
            label: 'Fees marked not applicable',
            detail: `${symbol} is excluded from fund expense-ratio calculations.`,
          })),
          ...features.feeAnalysis.nonUsdSymbols.map((symbol) => ({
            id: `non-usd-${symbol}`,
            severity: 'info' as const,
            label: 'Currency check',
            detail: `${symbol} is not USD; fee dollars use the holding currency amount.`,
          })),
        ]}
      />
    </section>
  );
};

const CompactAllocationTable: React.FC<{
  readonly title: string;
  readonly rows: readonly { key: string; label: string; valueCents: number; percent: number }[];
}> = ({ title, rows }) => (
  <div>
    <h5>{title}</h5>
    <table aria-label={title} style={tableStyle}>
      <thead>
        <tr>
          <TableHeader text="Name" />
          <TableHeader text="Value" align="right" />
          <TableHeader text="Percent" align="right" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <TableCell>{row.label}</TableCell>
            <TableCell align="right">
              <MoneyDisplay amount={row.valueCents} />
            </TableCell>
            <TableCell align="right">{row.percent}%</TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CompactCalendar: React.FC<{ readonly features: InvestingBetaFeaturesState }> = ({
  features,
}) => (
  <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-3)' }}>
    <table aria-label="Monthly dividend income calendar" style={tableStyle}>
      <thead>
        <tr>
          <TableHeader text="Month" />
          <TableHeader text="Forecast income" align="right" />
        </tr>
      </thead>
      <tbody>
        {features.dividendAnalysis.monthlyCalendar.map((row) => (
          <tr key={row.month}>
            <TableCell>{row.month}</TableCell>
            <TableCell align="right">
              <MoneyDisplay amount={row.amountCents} />
            </TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const RealizedGainsTable: React.FC<{ readonly features: InvestingBetaFeaturesState }> = ({
  features,
}) => (
  <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-3)' }}>
    <table aria-label="Realized gains by year" style={tableStyle}>
      <thead>
        <tr>
          <TableHeader text="Year" />
          <TableHeader text="Short-term" align="right" />
          <TableHeader text="Long-term" align="right" />
          <TableHeader text="Total" align="right" />
        </tr>
      </thead>
      <tbody>
        {features.costBasisAnalysis.realizedByYear.length === 0 ? (
          <tr>
            <TableCell colSpan={4}>No manual FIFO sales recorded.</TableCell>
          </tr>
        ) : (
          features.costBasisAnalysis.realizedByYear.map((row) => (
            <tr key={row.year}>
              <TableCell>{row.year}</TableCell>
              <TableCell align="right">{formatSignedMoney(row.shortTermCents)}</TableCell>
              <TableCell align="right">{formatSignedMoney(row.longTermCents)}</TableCell>
              <TableCell align="right">{formatSignedMoney(row.totalCents)}</TableCell>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

const SignalList: React.FC<{
  readonly title: string;
  readonly signals: readonly {
    id: string;
    severity: 'info' | 'warning' | 'critical';
    label: string;
    detail: string;
  }[];
}> = ({ title, signals }) => {
  if (signals.length === 0) return null;
  return (
    <div style={{ marginTop: 'var(--spacing-3)' }}>
      <h5>{title}</h5>
      <ul>
        {signals.map((signal) => (
          <li key={signal.id}>
            <strong>
              {severityLabel(signal.severity)}, {signal.label}:
            </strong>{' '}
            {signal.detail}
          </li>
        ))}
      </ul>
    </div>
  );
};

const SummaryGrid: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <div style={responsiveGridStyle}>{children}</div>
);

const Metric: React.FC<{ readonly label: string; readonly value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div
    style={{
      border: '1px solid var(--semantic-border-default, #e5e7eb)',
      borderRadius: 8,
      padding: 'var(--spacing-3)',
    }}
  >
    <div style={{ color: 'var(--semantic-text-secondary)' }}>{label}</div>
    <strong>{value}</strong>
  </div>
);

const TableHeader: React.FC<{ readonly text: string; readonly align?: 'left' | 'right' }> = ({
  text,
  align = 'left',
}) => (
  <th
    scope="col"
    style={{ textAlign: align, padding: 'var(--spacing-2)', borderBottom: tableBorder }}
  >
    {text}
  </th>
);

const TableCell: React.FC<{
  readonly children: React.ReactNode;
  readonly align?: 'left' | 'right';
  readonly colSpan?: number;
}> = ({ children, align = 'left', colSpan }) => (
  <td
    colSpan={colSpan}
    style={{ textAlign: align, padding: 'var(--spacing-2)', borderBottom: tableBorder }}
  >
    {children}
  </td>
);

const tableBorder = '1px solid var(--semantic-border-default, #e5e7eb)';
const tableStyle = { width: '100%', borderCollapse: 'collapse' } as const;
const responsiveGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 'var(--spacing-3)',
  margin: 'var(--spacing-3) 0',
} as const;

function useStoredState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStoredValue(key, defaultValue));
  const setStoredValue = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (nextValue) => {
      setValue((current) => {
        const resolved =
          typeof nextValue === 'function' ? (nextValue as (previous: T) => T)(current) : nextValue;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // In-memory state still works when storage is unavailable.
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, setStoredValue];
}

function readStoredValue<T>(key: string, defaultValue: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function upsert<T extends { readonly investmentId: string }>(
  items: readonly T[],
  investmentId: string,
  fallback: T,
  updates: Partial<T>,
): T[] {
  const next = {
    ...fallback,
    ...items.find((item) => item.investmentId === investmentId),
    ...updates,
  } as T;
  const without = items.filter((item) => item.investmentId !== investmentId);
  return [...without, next];
}

function defaultDividendAssumption(investmentId: string): DividendAssumption {
  return {
    investmentId,
    dividendPerShareCents: 0,
    frequency: 'QUARTERLY',
    lastExDate: '',
    taxClassification: 'Qualified',
  };
}

function defaultExpenseRatioSetting(investmentId: string, applies = true): ExpenseRatioSetting {
  return { investmentId, expenseRatioBps: null, applies };
}

function defaultManualSale(investmentId: string): ManualSaleInput {
  return { investmentId, saleDate: '', sharesSold: 0, salePriceCents: 0 };
}

function MoneyDisplay({ amount }: { readonly amount: number }): React.ReactElement {
  return <span>{formatMoney(amount)}</span>;
}

function formatMoney(amountCents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    amountCents / 100,
  );
}

function formatSignedMoney(amountCents: number): string {
  const formatted = formatMoney(Math.abs(amountCents));
  if (amountCents > 0) return `+${formatted}`;
  if (amountCents < 0) return `-${formatted}`;
  return formatted;
}

function severityLabel(severity: 'info' | 'warning' | 'critical'): string {
  if (severity === 'critical') return 'Critical';
  if (severity === 'warning') return 'Warning';
  return 'Info';
}
