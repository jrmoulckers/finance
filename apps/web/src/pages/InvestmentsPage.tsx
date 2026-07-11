// SPDX-License-Identifier: BUSL-1.1

/**
 * Investment portfolio page displaying all holdings with summary statistics
 * and an allocation chart.
 *
 * References: issue #1105
 */

import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  ExplainThis,
  LoadingSpinner,
  ReadAloudButton,
} from '../components/common';
import { DataExport } from '../components/DataExport';
import {
  InvestingBetaFeaturesPanel,
  useInvestingBetaFeatures,
} from '../components/investments/InvestingBetaFeatures';
import { InvestmentProjections } from '../components/investments/InvestmentProjections';
import { DeFiPositionsCard } from '../components/investments/DeFiPositionsCard';
import { useAccounts, useInvestments } from '../hooks';
import { formatCurrency, formatGainLoss } from '../lib/currency';
import type { Investment, InvestmentType } from '../kmp/bridge';
import type { IconName } from '../components/icons';
import {
  HoldingsTable,
  type HoldingRow,
  type HoldingsSortField,
} from '../components/investments/HoldingsTable';
import { rollUpHoldingsBySymbol } from '../lib/investment/holdings-rollup';
import type {
  InvestmentIncomeExportInput,
  InvestmentRealizedGainExportInput,
} from '../lib/export/investment-export';
import { DEFAULT_ASSET_CLASS_MAP } from '../lib/investment/allocation';
import { ASSET_CLASS_LABELS } from '../types/investment';

/**
 * Crypto wallet & exchange connectivity panel — lazily loaded as its own chunk
 * so its engine + form code never inflates the Investments route bundle.
 */
const CryptoConnectionsPanel = lazy(() =>
  import('../components/investments/CryptoConnectionsPanel').then((module) => ({
    default: module.CryptoConnectionsPanel,
  })),
);

/** Color palette for the allocation pie chart. */
const CHART_COLORS = [
  'var(--chart-color-1, #2563eb)',
  'var(--chart-color-2, #059669)',
  'var(--chart-color-3, #d97706)',
  'var(--chart-color-4, #dc2626)',
  'var(--chart-color-5, #7c3aed)',
  'var(--chart-color-6, #0891b2)',
  'var(--chart-color-7, #be185d)',
  'var(--chart-color-8, #4f46e5)',
];

/** Human-readable labels for investment types. */
const TYPE_LABELS: Record<InvestmentType, string> = {
  STOCK: 'Stock',
  BOND: 'Bond',
  ETF: 'ETF',
  MUTUAL_FUND: 'Mutual Fund',
  CRYPTO: 'Crypto',
  REAL_ESTATE: 'Real Estate',
  COMMODITY: 'Commodity',
  OTHER: 'Other',
};

/** Icons for investment types. */
function getInvestmentIcon(type: InvestmentType): IconName {
  switch (type) {
    case 'STOCK':
      return 'trending-up';
    case 'BOND':
      return 'bank';
    case 'ETF':
      return 'chart-bar';
    case 'MUTUAL_FUND':
      return 'folder';
    case 'CRYPTO':
      return 'wallet';
    case 'REAL_ESTATE':
      return 'home';
    case 'COMMODITY':
      return 'medal';
    default:
      return 'wallet';
  }
}

/**
 * Compute allocation data grouped by asset class (US stocks, bonds, crypto,
 * etc.) rather than by instrument type, so the "Asset Allocation" chart answers
 * the diversification question it poses. Investment types map to asset classes
 * via {@link DEFAULT_ASSET_CLASS_MAP}.
 */
function computeAllocation(
  investments: Investment[],
): Array<{ name: string; value: number; percent: number }> {
  const byClass = new Map<string, number>();

  for (const inv of investments) {
    const marketValue = inv.shares * inv.currentPricePerShare.amount;
    const assetClass = DEFAULT_ASSET_CLASS_MAP[inv.type] ?? 'OTHER';
    const label = ASSET_CLASS_LABELS[assetClass] ?? assetClass;
    byClass.set(label, (byClass.get(label) ?? 0) + marketValue);
  }

  const totalValue = Array.from(byClass.values()).reduce((sum, v) => sum + v, 0);

  return Array.from(byClass.entries())
    .map(([name, value]) => ({
      name,
      value: Math.round(value),
      percent: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Investment portfolio page component. */
export const InvestmentsPage: React.FC = () => {
  const investmentState = useInvestments();
  const {
    investments,
    summary,
    loading,
    error,
    refresh,
    getLots,
    displayCurrency,
    conversionDisclosure,
  } = investmentState;
  const optionalTaxData = investmentState as typeof investmentState & {
    realizedGains?: readonly InvestmentRealizedGainExportInput[];
    dividends?: readonly InvestmentIncomeExportInput[];
    income?: readonly InvestmentIncomeExportInput[];
  };
  const { accounts } = useAccounts();
  const [sortField, setSortField] = useState<HoldingsSortField>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [groupBySymbol, setGroupBySymbol] = useState(false);

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accounts) {
      map.set(account.id, account.name);
    }
    return map;
  }, [accounts]);

  const allocation = computeAllocation(investments);
  const investmentLots = useMemo(
    () => investments.flatMap((investment) => getLots(investment.id)),
    [getLots, investments],
  );
  const betaFeatures = useInvestingBetaFeatures({ investments, getLots });
  const investmentExport = useMemo(
    () => ({
      investments,
      lots: investmentLots,
      realizedGains: [
        ...(optionalTaxData.realizedGains ?? []),
        ...betaFeatures.realizedGainExportRows,
      ],
      dividends: [
        ...(optionalTaxData.dividends ?? []),
        ...(optionalTaxData.income ?? []),
        ...betaFeatures.dividendExportRows,
      ],
    }),
    [
      betaFeatures.dividendExportRows,
      betaFeatures.realizedGainExportRows,
      investments,
      investmentLots,
      optionalTaxData.dividends,
      optionalTaxData.income,
      optionalTaxData.realizedGains,
    ],
  );

  const handleSort = useCallback(
    (field: HoldingsSortField) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField],
  );

  // Build normalized, render-ready holdings rows — either per-account detail
  // rows (#3262 attribution) or symbol roll-up lines (#3262 cross-account
  // roll-up) — then sort them by the active column.
  const holdingRows = useMemo<HoldingRow[]>(() => {
    const dir = sortDirection === 'asc' ? 1 : -1;

    const rows: HoldingRow[] = groupBySymbol
      ? rollUpHoldingsBySymbol(
          investments.map((inv) => ({
            id: inv.id,
            symbol: inv.symbol,
            name: inv.name,
            shares: inv.shares,
            currentPricePerShareCents: inv.currentPricePerShare.amount,
            costBasisPerShareCents: inv.costBasisPerShare.amount,
            currencyCode: inv.currency.code,
            accountId: inv.accountId,
          })),
        ).map((line): HoldingRow => {
          const firstMatch = investments.find(
            (inv) => inv.symbol.trim().toUpperCase() === line.symbol,
          );
          const accountLabel =
            line.accountCount === 1 ? '1 account' : `${line.accountCount} accounts`;
          return {
            key: `${line.symbol}|${line.currencyCode}`,
            symbol: line.symbol,
            name: line.name,
            iconName: firstMatch ? getInvestmentIcon(firstMatch.type) : 'wallet',
            typeLabel: firstMatch ? TYPE_LABELS[firstMatch.type] : '—',
            accountLabel,
            shares: line.totalShares,
            pricePerShareCents: null,
            currencyCode: line.currencyCode,
            marketValueCents: line.marketValueCents,
            gainLossCents: line.gainLossCents,
            gainLossPercent: line.gainLossPercent,
          };
        })
      : investments.map((inv): HoldingRow => {
          const marketValue = Math.round(inv.shares * inv.currentPricePerShare.amount);
          const costBasis = Math.round(inv.shares * inv.costBasisPerShare.amount);
          const gainLoss = marketValue - costBasis;
          const gainLossPercent =
            costBasis > 0 ? Math.round((gainLoss / costBasis) * 10000) / 100 : 0;
          return {
            key: inv.id,
            to: `/investments/${inv.id}`,
            symbol: inv.symbol,
            name: inv.name,
            iconName: getInvestmentIcon(inv.type),
            typeLabel: TYPE_LABELS[inv.type],
            accountLabel: (inv.accountId && accountNameById.get(inv.accountId)) || 'Unassigned',
            shares: inv.shares,
            pricePerShareCents: inv.currentPricePerShare.amount,
            currencyCode: inv.currency.code,
            marketValueCents: marketValue,
            gainLossCents: gainLoss,
            gainLossPercent,
          };
        });

    return rows.sort((a, b) => {
      switch (sortField) {
        case 'symbol':
          return a.symbol.localeCompare(b.symbol) * dir;
        case 'value':
          return (a.marketValueCents - b.marketValueCents) * dir;
        case 'gainLoss':
          return (a.gainLossCents - b.gainLossCents) * dir;
        default:
          return 0;
      }
    });
  }, [investments, groupBySymbol, sortField, sortDirection, accountNameById]);

  return (
    <>
      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          Investments
        </h2>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading investments" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : investments.length === 0 ? (
        <EmptyState
          title="No investments yet"
          description="Add investment holdings to track your portfolio performance and asset allocation."
        />
      ) : (
        <>
          {/* Portfolio Summary */}
          <section className="page-section" aria-label="Portfolio summary">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-4)',
                }}
              >
                <div>
                  <p className="card__title">Total Value</p>
                  <p className="card__value" aria-live="polite">
                    <CurrencyDisplay amount={summary.totalValue} currency={displayCurrency} />
                    <ReadAloudButton
                      amount={summary.totalValue}
                      currency={displayCurrency}
                      context="total portfolio value"
                    />
                  </p>
                </div>
                <div>
                  <p className="card__title">Cost Basis</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={summary.totalCostBasis} currency={displayCurrency} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Total Gain/Loss</p>
                  <p
                    className="card__value"
                    style={{
                      color:
                        summary.totalGainLoss >= 0
                          ? 'var(--semantic-positive, #059669)'
                          : 'var(--semantic-negative, #dc2626)',
                    }}
                  >
                    {formatGainLoss(summary.totalGainLoss, { currency: displayCurrency })} (
                    {summary.totalGainLossPercent}%)
                  </p>
                </div>
                <div>
                  <p className="card__title">Holdings</p>
                  <p className="card__value">{investments.length}</p>
                </div>
              </div>
              {conversionDisclosure && (
                <p
                  role="note"
                  style={{
                    marginTop: 'var(--spacing-3)',
                    marginBottom: 0,
                    fontSize: 'var(--type-scale-caption-font-size)',
                    color: 'var(--semantic-text-secondary)',
                  }}
                >
                  {conversionDisclosure}
                </p>
              )}
            </div>
          </section>

          <section className="page-section" aria-label="Investment export tools">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <DataExport showFinanceExports={false} investmentExport={investmentExport} />
            </div>
          </section>

          {/* Allocation Chart */}
          {allocation.length > 0 && (
            <section className="page-section" aria-label="Asset allocation chart">
              <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-2)',
                    marginBottom: 'var(--spacing-4)',
                  }}
                >
                  <h3
                    style={{
                      fontWeight: 'var(--font-weight-semibold)',
                      margin: 0,
                    }}
                  >
                    Asset Allocation
                  </h3>
                  <ExplainThis
                    glossaryKey="diversification"
                    buttonLabel="Explain diversification"
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-6)',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ width: 200, height: 200 }} aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={allocation}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                        >
                          {allocation.map((_entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            formatCurrency(Math.round(Number(value ?? 0)), {
                              currency: displayCurrency,
                            })
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {allocation.map((item, index) => (
                      <li
                        key={item.name}
                        role="listitem"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--spacing-2)',
                          marginBottom: 'var(--spacing-1)',
                          fontSize: 'var(--type-scale-body-font-size)',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <span>
                          {item.name}: {item.percent}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Screen-reader accessible allocation summary */}
                <div className="sr-only" aria-live="polite">
                  Asset allocation:{' '}
                  {allocation.map((item) => `${item.name} ${item.percent}%`).join(', ')}
                </div>
              </div>
            </section>
          )}

          {/* Compound-growth projection (#2118) */}
          <InvestmentProjections
            currentValueCents={summary.totalValue}
            investedToDateCents={summary.totalCostBasis}
          />

          {/* DeFi / locked positions tracked separately from spot holdings (#2172) */}
          <DeFiPositionsCard spotLiquidValueCents={summary.totalValue} />

          {/* Holdings Table */}
          <InvestingBetaFeaturesPanel investments={investments} features={betaFeatures} />

          <section aria-label="Investment holdings">
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: 'var(--spacing-3)',
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-2)',
                    cursor: 'pointer',
                    fontSize: 'var(--type-scale-body-font-size)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={groupBySymbol}
                    onChange={(e) => setGroupBySymbol(e.target.checked)}
                  />
                  Group by symbol (roll up across accounts)
                </label>
              </div>
              <HoldingsTable
                rows={holdingRows}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                accountColumnLabel={groupBySymbol ? 'Accounts' : 'Account'}
              />
            </div>
          </section>
        </>
      )}

      {/* Crypto wallets & exchanges — available even with no brokerage holdings (#2164) */}
      <Suspense
        fallback={
          <p role="status" aria-live="polite" style={{ padding: 'var(--spacing-4, 16px)' }}>
            Loading crypto connectivity…
          </p>
        }
      >
        <CryptoConnectionsPanel />
      </Suspense>
    </>
  );
};

export default InvestmentsPage;
