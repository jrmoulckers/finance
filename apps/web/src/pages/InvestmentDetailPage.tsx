// SPDX-License-Identifier: BUSL-1.1

/**
 * Investment detail page showing individual holding performance, price history,
 * and key metrics.
 *
 * References: issue #1105
 */

import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { useInvestments } from '../hooks';
import type { InvestmentType } from '../kmp/bridge';

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

/** Format a gain/loss amount with sign. */
function formatGainLoss(amount: number): string {
  const prefix = amount >= 0 ? '+' : '';
  return `${prefix}${(amount / 100).toFixed(2)}`;
}

/** Investment detail page component. */
export const InvestmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { investments, loading, error, refresh } = useInvestments();

  const investment = investments.find((inv) => inv.id === id) ?? null;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading investment details" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (!investment) {
    return (
      <div style={{ padding: 'var(--spacing-6)' }}>
        <Link to="/investments" aria-label="Back to investments">
          ← Back to Investments
        </Link>
        <p style={{ marginTop: 'var(--spacing-4)', color: 'var(--semantic-text-secondary)' }}>
          Investment not found.
        </p>
      </div>
    );
  }

  const marketValue = Math.round(investment.shares * investment.currentPricePerShare.amount);
  const costBasis = Math.round(investment.shares * investment.costBasisPerShare.amount);
  const gainLoss = marketValue - costBasis;
  const gainLossPercent = costBasis > 0 ? Math.round((gainLoss / costBasis) * 10000) / 100 : 0;
  const isPositive = gainLoss >= 0;

  return (
    <>
      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <Link to="/investments" aria-label="Back to investments">
          ← Back to Investments
        </Link>
      </div>

      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          {investment.symbol} — {investment.name}
        </h2>
        <span
          style={{
            fontSize: 'var(--type-scale-caption-font-size)',
            color: 'var(--semantic-text-secondary)',
            padding: 'var(--spacing-1) var(--spacing-2)',
            backgroundColor: 'var(--semantic-surface-secondary, #f3f4f6)',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          {TYPE_LABELS[investment.type]}
        </span>
      </div>

      {/* Key Metrics */}
      <section className="page-section" aria-label="Investment metrics">
        <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--spacing-4)',
            }}
          >
            <div>
              <p className="card__title">Market Value</p>
              <p className="card__value" aria-live="polite">
                <CurrencyDisplay amount={marketValue} currency={investment.currency.code} />
              </p>
            </div>
            <div>
              <p className="card__title">Cost Basis</p>
              <p className="card__value">
                <CurrencyDisplay amount={costBasis} currency={investment.currency.code} />
              </p>
            </div>
            <div>
              <p className="card__title">Gain/Loss</p>
              <p
                className="card__value"
                style={{
                  color: isPositive
                    ? 'var(--semantic-positive, #059669)'
                    : 'var(--semantic-negative, #dc2626)',
                }}
              >
                {formatGainLoss(gainLoss)} ({gainLossPercent}%)
              </p>
            </div>
            <div>
              <p className="card__title">Shares</p>
              <p className="card__value">
                {investment.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </p>
            </div>
            <div>
              <p className="card__title">Current Price</p>
              <p className="card__value">
                <CurrencyDisplay
                  amount={investment.currentPricePerShare.amount}
                  currency={investment.currency.code}
                />
              </p>
            </div>
            <div>
              <p className="card__title">Avg. Cost</p>
              <p className="card__value">
                <CurrencyDisplay
                  amount={investment.costBasisPerShare.amount}
                  currency={investment.currency.code}
                />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Performance Indicator */}
      <section className="page-section" aria-label="Performance indicator">
        <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <h3
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            Performance
          </h3>
          <div
            className="progress-bar"
            role="progressbar"
            aria-valuenow={Math.min(Math.abs(gainLossPercent), 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${isPositive ? 'Gain' : 'Loss'} of ${Math.abs(gainLossPercent)}%`}
          >
            <div
              className={`progress-bar__fill progress-bar__fill--${isPositive ? 'positive' : 'negative'}`}
              style={{ width: `${Math.min(Math.abs(gainLossPercent), 100)}%` }}
            />
          </div>
          <p
            style={{
              marginTop: 'var(--spacing-2)',
              fontSize: 'var(--type-scale-caption-font-size)',
              color: 'var(--semantic-text-secondary)',
            }}
          >
            {isPositive
              ? `This holding is up ${gainLossPercent}% from your purchase price.`
              : `This holding is down ${Math.abs(gainLossPercent)}% from your purchase price.`}
          </p>
        </div>
      </section>

      {/* Details */}
      <section className="page-section" aria-label="Holding details">
        <div className="card">
          <h3
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            Details
          </h3>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: 'var(--spacing-2) var(--spacing-4)',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Symbol</dt>
            <dd style={{ margin: 0 }}>{investment.symbol}</dd>

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Name</dt>
            <dd style={{ margin: 0 }}>{investment.name}</dd>

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Type</dt>
            <dd style={{ margin: 0 }}>{TYPE_LABELS[investment.type]}</dd>

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Currency</dt>
            <dd style={{ margin: 0 }}>{investment.currency.code}</dd>

            {investment.lastPriceUpdate && (
              <>
                <dt style={{ color: 'var(--semantic-text-secondary)' }}>Last Price Update</dt>
                <dd style={{ margin: 0 }}>
                  {new Date(investment.lastPriceUpdate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </>
            )}

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Added</dt>
            <dd style={{ margin: 0 }}>
              {new Date(investment.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </dd>
          </dl>
        </div>
      </section>
    </>
  );
};

export default InvestmentDetailPage;
