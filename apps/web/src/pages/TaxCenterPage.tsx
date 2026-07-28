// SPDX-License-Identifier: BUSL-1.1

/** Tax Center page for lot-level P&L, estimated tax, and wash-sale guardrails. */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
  ScrollableRegion,
} from '../components/common';
import { Checkbox } from '../components/common/Checkbox';
import { useAccounts, useInvestments, useTransactions } from '../hooks';
import type { Investment, InvestmentLot } from '../kmp/bridge';
import { dollarsToCents as toCents, formatCurrency, formatGainLoss } from '../lib/currency';
import { summarizeTaggedRetirementContributions } from '../lib/tax/retirement-contribution-metadata';
import {
  computeTaxSummary,
  computeUnrealizedTaxLots,
  detectWashSaleGuardrails,
  matchSaleLots,
  type TaxLot,
  type TaxLotMatchingMethod,
} from '../lib/investment';

interface DisplayTaxLot extends TaxLot {
  readonly name: string;
  readonly currentPricePerShare: number;
  readonly currency: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dollarsToCents(value: string): number {
  return toCents(Number.parseFloat(value));
}

function parseShares(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(percent: number): string {
  return `${percent}%`;
}

const RETIREMENT_LIMIT_GROUP_LABELS: Record<string, string> = {
  IRA_COMBINED: 'IRA combined',
  EMPLOYER_PLAN_EMPLOYEE_DEFERRAL: '401(k)/403(b) employee deferral',
  EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS: 'Employer plan total annual additions',
  HSA_SELF_ONLY: 'HSA self-only',
  HSA_FAMILY: 'HSA family',
  HEALTH_FSA: 'Health FSA',
};

function syntheticLot(investment: Investment): DisplayTaxLot {
  const acquiredDate = investment.createdAt.slice(0, 10);
  return {
    id: `${investment.id}:aggregate`,
    symbol: investment.symbol,
    name: `${investment.name} (aggregate lot)`,
    shares: investment.shares,
    costPerShare: investment.costBasisPerShare.amount,
    acquiredDate,
    // createdAt is when the holding was added to the app, not when it was
    // actually purchased, so the holding-period classification is an estimate.
    acquiredDateEstimated: true,
    currentPricePerShare: investment.currentPricePerShare.amount,
    currency: investment.currency.code,
  };
}

function displayLot(investment: Investment, lot: InvestmentLot): DisplayTaxLot {
  return {
    id: lot.id,
    symbol: investment.symbol,
    name: investment.name,
    shares: lot.shares,
    costPerShare: lot.costPerShare.amount,
    acquiredDate: lot.purchaseDate,
    currentPricePerShare: investment.currentPricePerShare.amount,
    currency: investment.currency.code,
  };
}

export const TaxCenterPage: React.FC = () => {
  const {
    investments,
    loading: investmentsLoading,
    error: investmentsError,
    refresh,
    getLots,
  } = useInvestments();
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts();
  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions();
  const [retirementTaxYear, setRetirementTaxYear] = useState(() => new Date().getFullYear());
  const [saleSymbol, setSaleSymbol] = useState('');
  const [saleDate, setSaleDate] = useState(toIsoDate(new Date()));
  const [saleShares, setSaleShares] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [matchingMethod, setMatchingMethod] = useState<TaxLotMatchingMethod>('FIFO');
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([]);
  const [shortTermRate, setShortTermRate] = useState('35');
  const [longTermRate, setLongTermRate] = useState('15');

  const retirementSummary = useMemo(
    () =>
      summarizeTaggedRetirementContributions({
        accounts,
        transactions,
        profile: { taxYear: retirementTaxYear },
      }),
    [accounts, retirementTaxYear, transactions],
  );
  const taggedContributionCount = useMemo(
    () => new Set(retirementSummary.rows.flatMap((row) => row.contributionIds)).size,
    [retirementSummary.rows],
  );

  const taxLots = useMemo<DisplayTaxLot[]>(() => {
    return investments.flatMap((investment) => {
      const lots = getLots(investment.id);
      if (lots.length === 0 && investment.shares > 0) {
        return [syntheticLot(investment)];
      }
      return lots.map((lot) => displayLot(investment, lot));
    });
  }, [getLots, investments]);

  const hasEstimatedAcquisitionDates = useMemo(
    () => taxLots.some((lot) => lot.acquiredDateEstimated),
    [taxLots],
  );

  const activeSymbol = saleSymbol || taxLots[0]?.symbol || '';
  const activeLots = taxLots.filter((lot) => lot.symbol === activeSymbol);
  const effectiveSaleDate = saleDate || toIsoDate(new Date());

  useEffect(() => {
    setSelectedLotIds([]);
  }, [activeSymbol, matchingMethod]);

  const priceBySymbol = useMemo(() => {
    const prices = new Map<string, number>();
    for (const lot of taxLots) {
      prices.set(lot.symbol.toUpperCase(), lot.currentPricePerShare);
    }
    return prices;
  }, [taxLots]);

  const unrealizedLots = useMemo(
    () => computeUnrealizedTaxLots(taxLots, priceBySymbol, effectiveSaleDate),
    [effectiveSaleDate, priceBySymbol, taxLots],
  );

  const matchResult = useMemo(() => {
    if (!activeSymbol) return { closedLots: [], unmatchedShares: 0 };
    return matchSaleLots(taxLots, {
      symbol: activeSymbol,
      shares: parseShares(saleShares),
      salePricePerShare: dollarsToCents(salePrice),
      soldDate: effectiveSaleDate,
      matchingMethod,
      specificLotIds: selectedLotIds,
    });
  }, [
    activeSymbol,
    effectiveSaleDate,
    matchingMethod,
    salePrice,
    saleShares,
    selectedLotIds,
    taxLots,
  ]);

  const washSaleAlerts = useMemo(
    () => detectWashSaleGuardrails(matchResult.closedLots, taxLots),
    [matchResult.closedLots, taxLots],
  );

  const taxSummary = useMemo(
    () =>
      computeTaxSummary(
        matchResult.closedLots,
        Number.parseFloat(shortTermRate) || 0,
        Number.parseFloat(longTermRate) || 0,
        washSaleAlerts,
      ),
    [longTermRate, matchResult.closedLots, shortTermRate, washSaleAlerts],
  );

  const toggleSpecificLot = (lotId: string): void => {
    setSelectedLotIds((current) =>
      current.includes(lotId) ? current.filter((id) => id !== lotId) : [...current, lotId],
    );
  };

  const loading = investmentsLoading || accountsLoading || transactionsLoading;
  const error = investmentsError ?? accountsError ?? transactionsError;
  const handleRetry = (): void => {
    refresh();
    refreshAccounts();
    refreshTransactions();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading tax center" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={handleRetry} />;
  }

  return (
    <>
      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <Link to="/investments" aria-label="Back to investments">
          ← Back to Investments
        </Link>
      </div>

      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h1
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          Tax Center
        </h1>
        <p style={{ color: 'var(--semantic-text-secondary)', margin: 0 }}>
          Analyze lot-level realized P&amp;L, estimated taxes, and wash-sale guardrails before you
          trade.
        </p>
      </div>

      <section className="page-section" aria-label="Retirement contribution limits">
        <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 'var(--spacing-4)',
              flexWrap: 'wrap',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            <div>
              <h2
                style={{
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: 'var(--spacing-1)',
                }}
              >
                Retirement contribution limits
              </h2>
              <p style={{ color: 'var(--semantic-text-secondary)', margin: 0 }}>
                Tracks transactions tagged as retirement contributions against configured IRS
                limits.
              </p>
            </div>
            <label>
              <span className="card__title">Tax year</span>
              <input
                type="number"
                min="2024"
                max="2100"
                value={retirementTaxYear}
                onChange={(event) => setRetirementTaxYear(Number.parseInt(event.target.value, 10))}
                style={{ width: 96, marginLeft: 'var(--spacing-2)', padding: 'var(--spacing-2)' }}
              />
            </label>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--spacing-4)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            <div>
              <p className="card__title">Tagged contributions</p>
              <p className="card__value">{taggedContributionCount}</p>
            </div>
            <div>
              <p className="card__title">Total counted</p>
              <p className="card__value">
                <CurrencyDisplay amount={retirementSummary.totalContributedCents} />
              </p>
            </div>
            <div>
              <p className="card__title">Unsupported accounts</p>
              <p className="card__value">{retirementSummary.unsupportedAccountIds.length}</p>
            </div>
          </div>

          {retirementSummary.warnings.length > 0 && (
            <div role="alert" style={{ marginBottom: 'var(--spacing-4)' }}>
              {retirementSummary.warnings.map((warning) => (
                <p key={warning} style={{ color: 'var(--semantic-warning, #d97706)' }}>
                  {warning}
                </p>
              ))}
            </div>
          )}

          <ScrollableRegion label="Retirement contribution limits">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Limit group', 'Contributed', 'Limit', 'Remaining', 'Used', 'Status'].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        style={{
                          textAlign: heading === 'Limit group' ? 'left' : 'right',
                          padding: 'var(--spacing-3)',
                          borderBottom: '2px solid var(--semantic-border-default, #e5e7eb)',
                        }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {retirementSummary.rows.map((row) => (
                  <tr key={row.group}>
                    <td style={{ padding: 'var(--spacing-3)' }}>
                      {RETIREMENT_LIMIT_GROUP_LABELS[row.group] ?? row.group}
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                      <CurrencyDisplay amount={row.contributedCents} />
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                      <CurrencyDisplay amount={row.limitCents} />
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                      <CurrencyDisplay amount={row.remainingCents} />
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                      {formatPercent(row.percentUsed)}
                    </td>
                    <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableRegion>
        </div>
      </section>

      {taxLots.length === 0 ? (
        <EmptyState
          title="No tax lots yet"
          description="Add investment lots to track cost basis, realized gains, and wash-sale windows."
        />
      ) : (
        <>
          <section className="page-section" aria-label="Sale lot matching">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <h2
                style={{
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: 'var(--spacing-4)',
                }}
              >
                Sale analyzer
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 'var(--spacing-4)',
                }}
              >
                <label>
                  <span className="card__title">Symbol</span>
                  <select
                    value={activeSymbol}
                    onChange={(event) => setSaleSymbol(event.target.value)}
                    style={{ width: '100%', padding: 'var(--spacing-2)' }}
                  >
                    {[...new Set(taxLots.map((lot) => lot.symbol))].map((symbol) => (
                      <option key={symbol} value={symbol}>
                        {symbol}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="card__title">Sale date</span>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(event) => setSaleDate(event.target.value)}
                    style={{ width: '100%', padding: 'var(--spacing-2)' }}
                  />
                </label>
                <label>
                  <span className="card__title">Shares sold</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={saleShares}
                    onChange={(event) => setSaleShares(event.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: 'var(--spacing-2)' }}
                  />
                </label>
                <label>
                  <span className="card__title">Sale price/share ($)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salePrice}
                    onChange={(event) => setSalePrice(event.target.value)}
                    placeholder="0.00"
                    style={{ width: '100%', padding: 'var(--spacing-2)' }}
                  />
                </label>
                <label>
                  <span className="card__title">Lot matching</span>
                  <select
                    value={matchingMethod}
                    onChange={(event) =>
                      setMatchingMethod(event.target.value as TaxLotMatchingMethod)
                    }
                    style={{ width: '100%', padding: 'var(--spacing-2)' }}
                  >
                    <option value="FIFO">FIFO (default)</option>
                    <option value="SPECIFIC_ID">Specific lot</option>
                  </select>
                </label>
              </div>

              {matchingMethod === 'SPECIFIC_ID' && (
                <div style={{ marginTop: 'var(--spacing-4)' }}>
                  <p className="card__title">Select lots to sell, in selection order</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-3)' }}>
                    {activeLots.map((lot) => (
                      <Checkbox
                        key={lot.id}
                        checked={selectedLotIds.includes(lot.id)}
                        onChange={() => toggleSpecificLot(lot.id)}
                        label={
                          <>
                            {lot.acquiredDate} · {lot.shares.toLocaleString()} shares @{' '}
                            {formatCurrency(lot.costPerShare, { currency: lot.currency })}
                          </>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="page-section" aria-label="Realized gain summary">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: 'var(--spacing-4)',
                }}
              >
                <div>
                  <p className="card__title">ST realized</p>
                  <p className="card__value">{formatGainLoss(taxSummary.shortTermGainLoss)}</p>
                </div>
                <div>
                  <p className="card__title">LT realized</p>
                  <p className="card__value">{formatGainLoss(taxSummary.longTermGainLoss)}</p>
                </div>
                <div>
                  <p className="card__title">Net realized</p>
                  <p className="card__value">{formatGainLoss(taxSummary.netGainLoss)}</p>
                </div>
                <div>
                  <p className="card__title">Estimated tax</p>
                  <p className="card__value">
                    <CurrencyDisplay amount={taxSummary.estimatedTax} />
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-4)',
                  marginTop: 'var(--spacing-4)',
                }}
              >
                <label>
                  ST tax rate %
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={shortTermRate}
                    onChange={(event) => setShortTermRate(event.target.value)}
                    style={{ marginLeft: 'var(--spacing-2)', width: 80 }}
                  />
                </label>
                <label>
                  LT tax rate %
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={longTermRate}
                    onChange={(event) => setLongTermRate(event.target.value)}
                    style={{ marginLeft: 'var(--spacing-2)', width: 80 }}
                  />
                </label>
              </div>
              {taxSummary.washSaleDisallowedLoss > 0 && (
                <p
                  style={{
                    marginTop: 'var(--spacing-3)',
                    color: 'var(--semantic-negative, #dc2626)',
                  }}
                >
                  Wash-sale addback: {formatCurrency(taxSummary.washSaleDisallowedLoss)} of losses
                  may be disallowed.
                </p>
              )}
              {taxSummary.netDeductibleLoss > 0 && (
                <p style={{ marginTop: 'var(--spacing-3)' }}>
                  Net capital loss: {formatCurrency(taxSummary.netDeductibleLoss)} is deductible
                  against ordinary income this year
                  {taxSummary.lossCarryforward > 0 && (
                    <>
                      {' '}
                      and {formatCurrency(taxSummary.lossCarryforward)} carries forward to future
                      years
                    </>
                  )}
                  . Assumes the $3,000 single/MFJ annual limit.
                </p>
              )}
              {hasEstimatedAcquisitionDates && (
                <p
                  style={{
                    marginTop: 'var(--spacing-3)',
                    color: 'var(--semantic-text-secondary)',
                  }}
                >
                  Holdings without recorded purchase lots use an estimated acquisition date (when
                  the holding was added), so short- vs. long-term classification and the estimated
                  tax for those are approximate. Add purchase lots for exact holding periods.
                </p>
              )}
            </div>
          </section>

          {washSaleAlerts.length > 0 && (
            <section className="page-section" aria-label="Wash sale warnings">
              <div
                className="card"
                style={{
                  marginBottom: 'var(--spacing-6)',
                  borderColor: 'var(--semantic-warning, #d97706)',
                }}
              >
                <h2
                  style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    marginBottom: 'var(--spacing-3)',
                  }}
                >
                  Wash-sale guardrails
                </h2>
                {washSaleAlerts.map((alert) => (
                  <p
                    key={`${alert.closedLotId}-${alert.soldDate}`}
                    style={{ marginBottom: 'var(--spacing-2)' }}
                  >
                    {alert.explanation} Replacement lots:{' '}
                    {alert.replacementLots
                      .map((lot) => `${lot.lotId} (${lot.acquiredDate})`)
                      .join(', ')}
                    .
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className="page-section" aria-label="Closed tax lots">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <h2
                style={{
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: 'var(--spacing-4)',
                }}
              >
                Matched closed lots
              </h2>
              {matchResult.unmatchedShares > 0 && (
                <p style={{ color: 'var(--semantic-negative, #dc2626)' }}>
                  {matchResult.unmatchedShares.toLocaleString()} shares could not be matched to open
                  lots.
                </p>
              )}
              {matchResult.closedLots.length === 0 ? (
                <p style={{ color: 'var(--semantic-text-secondary)' }}>
                  Enter a sale above to preview realized gains and holding-period classification.
                </p>
              ) : (
                <ScrollableRegion label="Realized gains by lot">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {[
                          'Lot',
                          'Acquired',
                          'Sold',
                          'Shares',
                          'Proceeds',
                          'Cost basis',
                          'Gain/Loss',
                          'Term',
                        ].map((heading) => (
                          <th
                            key={heading}
                            scope="col"
                            style={{
                              textAlign: heading === 'Lot' ? 'left' : 'right',
                              padding: 'var(--spacing-3)',
                              borderBottom: '2px solid var(--semantic-border-default, #e5e7eb)',
                            }}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matchResult.closedLots.map((lot, index) => (
                        <tr key={`${lot.lotId}-${index}`}>
                          <td style={{ padding: 'var(--spacing-3)' }}>{lot.lotId}</td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {lot.acquiredDate}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {lot.soldDate}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {lot.shares.toLocaleString()}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            <CurrencyDisplay amount={lot.proceeds} />
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            <CurrencyDisplay amount={lot.costBasis} />
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {formatGainLoss(lot.gainLoss)}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {lot.term === 'LONG_TERM' ? 'Long-term' : 'Short-term'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableRegion>
              )}
            </div>
          </section>

          <section className="page-section" aria-label="Unrealized gains for open lots">
            <div className="card">
              <h2
                style={{
                  fontWeight: 'var(--font-weight-semibold)',
                  marginBottom: 'var(--spacing-4)',
                }}
              >
                Open lots · unrealized gains
              </h2>
              <ScrollableRegion label="Open lots and unrealized gains">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[
                        'Symbol',
                        'Acquired',
                        'Shares',
                        'Cost/share',
                        'Current/share',
                        'Unrealized',
                        'Term today',
                      ].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          style={{
                            textAlign: heading === 'Symbol' ? 'left' : 'right',
                            padding: 'var(--spacing-3)',
                            borderBottom: '2px solid var(--semantic-border-default, #e5e7eb)',
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unrealizedLots.map((row) => {
                      const lot = row.lot as DisplayTaxLot;
                      return (
                        <tr key={lot.id}>
                          <td style={{ padding: 'var(--spacing-3)' }}>
                            <strong>{lot.symbol}</strong>
                            <br />
                            <span style={{ color: 'var(--semantic-text-secondary)' }}>
                              {lot.name}
                            </span>
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {lot.acquiredDate}
                            {lot.acquiredDateEstimated && (
                              <span
                                title="Estimated acquisition date — add a purchase lot for the exact date"
                                style={{ color: 'var(--semantic-text-secondary)' }}
                              >
                                {' '}
                                (est.)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {lot.shares.toLocaleString()}
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            <CurrencyDisplay amount={lot.costPerShare} currency={lot.currency} />
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            <CurrencyDisplay
                              amount={row.currentPricePerShare}
                              currency={lot.currency}
                            />
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {formatGainLoss(row.unrealizedGainLoss, { currency: lot.currency })} (
                            {row.unrealizedGainLossPercent}%)
                          </td>
                          <td style={{ padding: 'var(--spacing-3)', textAlign: 'right' }}>
                            {row.termAsOfDate === 'LONG_TERM' ? 'Long-term' : 'Short-term'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollableRegion>
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default TaxCenterPage;
