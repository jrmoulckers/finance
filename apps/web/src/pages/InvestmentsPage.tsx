// SPDX-License-Identifier: BUSL-1.1

/**
 * Investment portfolio page displaying all holdings with summary statistics
 * and an allocation chart.
 *
 * References: issue #1105
 */

import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import {
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  ExplainThis,
  LoadingSpinner,
} from '../components/common';
import { useInvestments } from '../hooks';
import { formatCurrency, formatGainLoss } from '../lib/currency';
import type { Investment, InvestmentType } from '../kmp/bridge';
import { AppIcon, type IconName } from '../components/icons';

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

/** Compute allocation data grouped by investment type. */
function computeAllocation(
  investments: Investment[],
): Array<{ name: string; value: number; percent: number }> {
  const byType = new Map<string, number>();

  for (const inv of investments) {
    const marketValue = inv.shares * inv.currentPricePerShare.amount;
    const label = TYPE_LABELS[inv.type] ?? inv.type;
    byType.set(label, (byType.get(label) ?? 0) + marketValue);
  }

  const totalValue = Array.from(byType.values()).reduce((sum, v) => sum + v, 0);

  return Array.from(byType.entries())
    .map(([name, value]) => ({
      name,
      value: Math.round(value),
      percent: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Investment portfolio page component. */
export const InvestmentsPage: React.FC = () => {
  const { investments, summary, loading, error, refresh } = useInvestments();
  const [sortField, setSortField] = useState<'symbol' | 'value' | 'gainLoss'>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const allocation = computeAllocation(investments);

  const handleSort = useCallback(
    (field: 'symbol' | 'value' | 'gainLoss') => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField],
  );

  const sortedInvestments = [...investments].sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortField) {
      case 'symbol':
        return a.symbol.localeCompare(b.symbol) * dir;
      case 'value': {
        const aVal = a.shares * a.currentPricePerShare.amount;
        const bVal = b.shares * b.currentPricePerShare.amount;
        return (aVal - bVal) * dir;
      }
      case 'gainLoss': {
        const aGain = a.shares * (a.currentPricePerShare.amount - a.costBasisPerShare.amount);
        const bGain = b.shares * (b.currentPricePerShare.amount - b.costBasisPerShare.amount);
        return (aGain - bGain) * dir;
      }
      default:
        return 0;
    }
  });

  const sortArrow = sortDirection === 'asc' ? ' ↑' : ' ↓';

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
                    <CurrencyDisplay amount={summary.totalValue} />
                  </p>
                </div>
                <div>
                  <p className="card__title">Cost Basis</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={summary.totalCostBasis} />
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
                    {formatGainLoss(summary.totalGainLoss)} ({summary.totalGainLossPercent}%)
                  </p>
                </div>
                <div>
                  <p className="card__title">Holdings</p>
                  <p className="card__value">{investments.length}</p>
                </div>
              </div>
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
                              currency: 'USD',
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

          {/* Holdings Table */}
          <section aria-label="Investment holdings">
            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{ width: '100%', borderCollapse: 'collapse' }}
                  aria-label="Investment holdings table"
                >
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        style={{
                          textAlign: 'left',
                          padding: 'var(--spacing-3)',
                          cursor: 'pointer',
                          borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
                          userSelect: 'none',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort('symbol')}
                          aria-label={`Sort by symbol${sortField === 'symbol' ? sortArrow : ''}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            font: 'inherit',
                            color: 'inherit',
                            padding: 0,
                          }}
                        >
                          Symbol{sortField === 'symbol' ? sortArrow : ''}
                        </button>
                      </th>
                      <th
                        scope="col"
                        style={{
                          textAlign: 'left',
                          padding: 'var(--spacing-3)',
                          borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
                        }}
                      >
                        Type
                      </th>
                      <th
                        scope="col"
                        style={{
                          textAlign: 'right',
                          padding: 'var(--spacing-3)',
                          borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
                        }}
                      >
                        Shares
                      </th>
                      <th
                        scope="col"
                        style={{
                          textAlign: 'right',
                          padding: 'var(--spacing-3)',
                          borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
                        }}
                      >
                        Price
                      </th>
                      <th
                        scope="col"
                        style={{
                          textAlign: 'right',
                          padding: 'var(--spacing-3)',
                          cursor: 'pointer',
                          borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
                          userSelect: 'none',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort('value')}
                          aria-label={`Sort by market value${sortField === 'value' ? sortArrow : ''}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            font: 'inherit',
                            color: 'inherit',
                            padding: 0,
                          }}
                        >
                          Market Value{sortField === 'value' ? sortArrow : ''}
                        </button>
                      </th>
                      <th
                        scope="col"
                        style={{
                          textAlign: 'right',
                          padding: 'var(--spacing-3)',
                          cursor: 'pointer',
                          borderBottom: '2px solid var(--semantic-border, #e5e7eb)',
                          userSelect: 'none',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort('gainLoss')}
                          aria-label={`Sort by gain/loss${sortField === 'gainLoss' ? sortArrow : ''}`}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            font: 'inherit',
                            color: 'inherit',
                            padding: 0,
                          }}
                        >
                          Gain/Loss{sortField === 'gainLoss' ? sortArrow : ''}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInvestments.map((inv) => {
                      const marketValue = Math.round(inv.shares * inv.currentPricePerShare.amount);
                      const costBasis = Math.round(inv.shares * inv.costBasisPerShare.amount);
                      const gainLoss = marketValue - costBasis;
                      const gainLossPercent =
                        costBasis > 0 ? Math.round((gainLoss / costBasis) * 10000) / 100 : 0;

                      return (
                        <tr
                          key={inv.id}
                          style={{
                            borderBottom: '1px solid var(--semantic-border, #e5e7eb)',
                          }}
                        >
                          <td style={{ padding: 'var(--spacing-3)' }}>
                            <Link
                              to={`/investments/${inv.id}`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                              aria-label={`View details for ${inv.name} (${inv.symbol})`}
                            >
                              <AppIcon name={getInvestmentIcon(inv.type)} />{' '}
                              <strong>{inv.symbol}</strong>
                              <br />
                              <span
                                style={{
                                  fontSize: 'var(--type-scale-caption-font-size)',
                                  color: 'var(--semantic-text-secondary)',
                                }}
                              >
                                {inv.name}
                              </span>
                            </Link>
                          </td>
                          <td style={{ padding: 'var(--spacing-3)' }}>{TYPE_LABELS[inv.type]}</td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {inv.shares.toLocaleString(undefined, {
                              maximumFractionDigits: 4,
                            })}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            <CurrencyDisplay
                              amount={inv.currentPricePerShare.amount}
                              currency={inv.currency.code}
                            />
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            <CurrencyDisplay amount={marketValue} currency={inv.currency.code} />
                          </td>
                          <td
                            style={{
                              padding: 'var(--spacing-3)',
                              textAlign: 'right',
                              color:
                                gainLoss >= 0
                                  ? 'var(--semantic-positive, #059669)'
                                  : 'var(--semantic-negative, #dc2626)',
                            }}
                          >
                            {formatGainLoss(gainLoss)} ({gainLossPercent}%)
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default InvestmentsPage;
