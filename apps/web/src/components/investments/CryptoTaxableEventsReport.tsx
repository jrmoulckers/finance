// SPDX-License-Identifier: BUSL-1.1

/**
 * Presentational report for chain-aware crypto taxable events (DeFi).
 *
 * Given a set of swap/bridge/airdrop events and the opening tax-lot book, this
 * component runs the pure {@link processCryptoEvents} engine and renders:
 *   - headline totals (realized short/long-term gains and airdrop income),
 *   - a per-event breakdown tagged with chain and tax treatment.
 *
 * The component is data-source agnostic — events and lots arrive via props, so
 * it can later be wired to a hook/repository without changes here. It performs
 * no data access and holds no state beyond a memoized derivation.
 *
 * References: issue #2168
 */

import React, { useMemo } from 'react';
import {
  processCryptoEvents,
  type CryptoEventResult,
  type CryptoLotMethod,
  type CryptoTaxableEvent,
  type CryptoTaxLot,
} from '../../lib/assets';
import { formatCurrency } from '../../lib/currency';

/** Props for {@link CryptoTaxableEventsReport}. */
export interface CryptoTaxableEventsReportProps {
  /** Swap/bridge/airdrop events to summarize (any order; sorted by date). */
  readonly events: readonly CryptoTaxableEvent[];
  /** Opening tax-lot book the events are applied against. */
  readonly openingLots?: readonly CryptoTaxLot[];
  /** Lot-matching method for disposals (default FIFO). */
  readonly method?: CryptoLotMethod;
  /** ISO 4217 currency code for display formatting (default USD). */
  readonly currency?: string;
}

const EVENT_TYPE_LABELS: Record<CryptoEventResult['eventType'], string> = {
  SWAP: 'Swap',
  BRIDGE: 'Bridge',
  AIRDROP: 'Airdrop',
};

/**
 * Render a chain-aware crypto taxable-events summary and per-event table.
 */
export const CryptoTaxableEventsReport: React.FC<CryptoTaxableEventsReportProps> = ({
  events,
  openingLots,
  method = 'FIFO',
  currency = 'USD',
}) => {
  const batch = useMemo(
    () => processCryptoEvents(openingLots ?? [], events, method),
    [openingLots, events, method],
  );

  const money = (cents: number): string =>
    formatCurrency(cents, { currency, signDisplay: 'exceptZero' });

  if (events.length === 0) {
    return (
      <section aria-labelledby="crypto-defi-events-heading">
        <h3 id="crypto-defi-events-heading">Crypto taxable events</h3>
        <p style={{ color: 'var(--semantic-text-secondary)' }}>
          No swaps, bridges, or airdrops recorded yet.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="crypto-defi-events-heading">
      <h3 id="crypto-defi-events-heading">Crypto taxable events ({method})</h3>

      <dl style={summaryGridStyle}>
        <SummaryStat
          label="Short-term gain/loss"
          value={money(batch.totalShortTermGainLossCents)}
        />
        <SummaryStat label="Long-term gain/loss" value={money(batch.totalLongTermGainLossCents)} />
        <SummaryStat label="Realized gain/loss" value={money(batch.totalRealizedGainLossCents)} />
        <SummaryStat label="Airdrop income" value={money(batch.totalOrdinaryIncomeCents)} />
        <SummaryStat label="Taxable events" value={String(batch.taxableEventCount)} />
      </dl>

      <div style={{ overflowX: 'auto', marginTop: 'var(--spacing-4)' }}>
        <table style={tableStyle} aria-label="Crypto taxable events">
          <thead>
            <tr>
              <Th text="Date" />
              <Th text="Type" />
              <Th text="Chain" />
              <Th text="Treatment" />
              <Th text="Realized G/L" align="right" />
              <Th text="Income" align="right" />
            </tr>
          </thead>
          <tbody>
            {batch.events.map((result) => (
              <tr key={result.eventId}>
                <Td>{result.date}</Td>
                <Td>{EVENT_TYPE_LABELS[result.eventType]}</Td>
                <Td>{result.chain}</Td>
                <Td>
                  <span style={result.taxable ? taxableBadgeStyle : nonTaxableBadgeStyle}>
                    {result.taxable ? 'Taxable' : 'Non-taxable'}
                  </span>
                </Td>
                <Td align="right">{money(result.realizedGainLossCents)}</Td>
                <Td align="right">{money(result.ordinaryIncomeCents)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Presentational helpers
// ---------------------------------------------------------------------------

const SummaryStat: React.FC<{ readonly label: string; readonly value: string }> = ({
  label,
  value,
}) => (
  <div style={statCardStyle}>
    <dt style={statLabelStyle}>{label}</dt>
    <dd style={statValueStyle}>{value}</dd>
  </div>
);

const Th: React.FC<{ readonly text: string; readonly align?: 'left' | 'right' }> = ({
  text,
  align = 'left',
}) => (
  <th scope="col" style={{ ...cellStyle, textAlign: align }}>
    {text}
  </th>
);

const Td: React.FC<{ readonly children: React.ReactNode; readonly align?: 'left' | 'right' }> = ({
  children,
  align = 'left',
}) => <td style={{ ...cellStyle, textAlign: align }}>{children}</td>;

// ---------------------------------------------------------------------------
// Styles (design tokens with safe fallbacks)
// ---------------------------------------------------------------------------

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 'var(--spacing-3)',
  margin: 0,
};

const statCardStyle: React.CSSProperties = {
  padding: 'var(--spacing-3)',
  borderRadius: 'var(--radius-md, 8px)',
  background: 'var(--semantic-background-secondary, #f9fafb)',
};

const statLabelStyle: React.CSSProperties = {
  color: 'var(--semantic-text-secondary)',
  fontSize: 'var(--font-size-sm, 0.875rem)',
};

const statValueStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 700,
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--font-size-sm, 0.875rem)',
};

const cellStyle: React.CSSProperties = {
  padding: 'var(--spacing-2)',
  borderBottom: '1px solid var(--semantic-border-default, #e5e7eb)',
};

const taxableBadgeStyle: React.CSSProperties = {
  color: 'var(--semantic-warning, #b45309)',
  fontWeight: 600,
};

const nonTaxableBadgeStyle: React.CSSProperties = {
  color: 'var(--semantic-text-secondary, #6b7280)',
  fontWeight: 600,
};
