// SPDX-License-Identifier: BUSL-1.1

/**
 * LivePnlDashboard — presentational view for live cross-broker P&L + net worth.
 *
 * Pure/props-driven so it can be unit-tested without a database or price
 * source. The page wires it to {@link useLivePnl}.
 *
 * Accessibility:
 * - Gain/loss is conveyed by a shape glyph (▲ / ▼ / ◆), an explicit sign, and a
 *   text label — never colour alone (WCAG 2.2 AA, 1.4.1 Use of Color).
 * - Breakdown data uses real `<table>` semantics with scoped headers.
 * - A polite live region announces refreshed totals so screen-reader users
 *   following an intraday session hear updates without losing focus.
 * - The freshness badge exposes its meaning via text + `aria-label`.
 *
 * References: issue #2124
 */

import React from 'react';
import { CurrencyDisplay } from '../common';
import { formatRelativeAge } from '../../lib/investment';
import type {
  LivePnlView,
  PnlBreakdown,
  PnlIndicator,
  StalenessSummary,
} from '../../lib/investment';
import './live-pnl-dashboard.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LivePnlDashboardProps {
  /** The computed live view model. */
  view: LivePnlView;
  /** Whether the price source is currently streaming. */
  isLive: boolean;
  /** Last price-source error, if any. */
  error?: string | null;
  /** Invoked when the user requests an immediate refresh. */
  onRefresh: () => void;
  /** Override "now" for deterministic relative-time rendering (tests). */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PnlFigureProps {
  amountCents: number;
  indicator: PnlIndicator;
  currency: string;
  context: string;
  /** Show the lowercase direction tag (gain/loss/flat) after the amount. */
  showTag?: boolean;
}

/**
 * Renders a P&L amount with redundant direction cues: a shape glyph, an
 * explicit +/− sign on the value, an optional text tag, and (supplementary)
 * colour. The accessible label spells out the direction and amount.
 */
const PnlFigure: React.FC<PnlFigureProps> = ({
  amountCents,
  indicator,
  currency,
  context,
  showTag = false,
}) => {
  const directionWord =
    indicator.direction === 'gain' ? 'up' : indicator.direction === 'loss' ? 'down' : 'unchanged';
  return (
    <span
      className={`live-pnl__figure live-pnl__figure--${indicator.direction}`}
      aria-label={`${context}: ${directionWord}`}
    >
      <span className="live-pnl__figure-glyph" aria-hidden="true">
        {indicator.arrow}
      </span>
      <CurrencyDisplay amount={amountCents} currency={currency} showSign context={context} />
      {showTag && (
        <span className="live-pnl__figure-tag" aria-hidden="true">
          {indicator.label}
        </span>
      )}
    </span>
  );
};

const TONE_GLYPH: Record<StalenessSummary['tone'], string> = {
  live: '●',
  delayed: '◐',
  stale: '◑',
  critical: '▲',
  empty: '○',
};

interface FreshnessBadgeProps {
  staleness: StalenessSummary;
}

const FreshnessBadge: React.FC<FreshnessBadgeProps> = ({ staleness }) => (
  <span
    className={`live-pnl__badge live-pnl__badge--${staleness.tone}`}
    role="status"
    aria-label={`Market data status: ${staleness.label}. ${staleness.description}`}
    title={staleness.description}
  >
    <span className="live-pnl__badge-glyph" aria-hidden="true">
      {TONE_GLYPH[staleness.tone]}
    </span>
    {staleness.label}
  </span>
);

interface BreakdownTableProps {
  id: string;
  caption: string;
  columnLabel: string;
  rows: readonly PnlBreakdown[];
  currency: string;
  staleKeys?: readonly string[];
  /** Resolve a display label for each row key (default: identity). */
  labelFor?: (key: string) => string;
}

const BreakdownTable: React.FC<BreakdownTableProps> = ({
  id,
  caption,
  columnLabel,
  rows,
  currency,
  staleKeys = [],
  labelFor = (key) => key,
}) => {
  if (rows.length === 0) return null;
  const staleSet = new Set(staleKeys.map((key) => key.toUpperCase()));
  return (
    <div className="live-pnl__table-wrap">
      <table className="live-pnl__table" aria-describedby={`${id}-caption`}>
        <caption id={`${id}-caption`}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{columnLabel}</th>
            <th scope="col">Market value</th>
            <th scope="col">Day P&amp;L</th>
            <th scope="col">Unrealized P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isStale = staleSet.has(row.key.toUpperCase());
            return (
              <tr key={row.key}>
                <th scope="row">
                  {labelFor(row.key)}
                  {isStale && (
                    <span className="live-pnl__stale-flag" title="Quote is stale or missing">
                      {' '}
                      ⚠ stale
                    </span>
                  )}
                </th>
                <td>
                  <CurrencyDisplay amount={row.marketValueCents} currency={currency} />
                </td>
                <td>
                  <PnlFigure
                    amountCents={row.dayPnlCents}
                    indicator={pnlIndicatorFor(row.dayPnlCents)}
                    currency={currency}
                    context={`${labelFor(row.key)} day P&L`}
                  />
                </td>
                <td>
                  <PnlFigure
                    amountCents={row.unrealizedPnlCents}
                    indicator={pnlIndicatorFor(row.unrealizedPnlCents)}
                    currency={currency}
                    context={`${labelFor(row.key)} unrealized P&L`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** Local lightweight indicator (avoids importing the engine for a tiny calc). */
function pnlIndicatorFor(cents: number): PnlIndicator {
  if (cents > 0) return { direction: 'gain', sign: '+', arrow: '▲', label: 'gain' };
  if (cents < 0) return { direction: 'loss', sign: '−', arrow: '▼', label: 'loss' };
  return { direction: 'flat', sign: '', arrow: '◆', label: 'flat' };
}

const ASSET_CLASS_LABEL: Record<string, string> = {
  equity: 'Equities',
  option: 'Options',
  crypto: 'Crypto',
  cash: 'Cash',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const LivePnlDashboard: React.FC<LivePnlDashboardProps> = ({
  view,
  isLive,
  error,
  onRefresh,
  now,
}) => {
  const nowMs = now ? now() : Date.now();
  const ageMs = view.lastUpdated ? Math.max(0, nowMs - new Date(view.lastUpdated).getTime()) : null;
  const updatedLabel =
    ageMs === null ? 'Awaiting first update' : `Updated ${formatRelativeAge(ageMs)}`;
  const { currency } = view;

  // Concise summary announced to assistive tech whenever totals change.
  const liveSummary = `${view.indicators.day.label === 'flat' ? 'No change' : `Day ${view.indicators.day.label}`} ${view.dayPnlPercent}%. ${updatedLabel}. Market data ${view.staleness.label}.`;

  return (
    <div className="live-pnl">
      <header className="live-pnl__header">
        <div>
          <h1 className="live-pnl__title">Live P&amp;L &amp; Net Worth</h1>
          <p className="live-pnl__subtitle">
            Cross-broker intraday performance across {view.report.breakdowns.byBrokerage.length}{' '}
            brokerage{view.report.breakdowns.byBrokerage.length === 1 ? '' : 's'}.
          </p>
        </div>
      </header>

      {/* Live status / controls */}
      <div className="live-pnl__statusbar">
        <div className="live-pnl__status-group">
          <FreshnessBadge staleness={view.staleness} />
          <span className="live-pnl__updated">{updatedLabel}</span>
        </div>
        <div className="live-pnl__status-group live-pnl__status-group--end">
          <span
            className={`live-pnl__pulse ${isLive ? '' : 'live-pnl__pulse--paused'}`}
            aria-hidden="true"
          />
          <span className="live-pnl__updated">{isLive ? 'Streaming' : 'Paused'}</span>
          <button type="button" className="live-pnl__refresh" onClick={onRefresh}>
            Refresh now
          </button>
        </div>
      </div>

      {error && (
        <p className="live-pnl__error" role="alert">
          <span aria-hidden="true">⚠</span> {error}
        </p>
      )}

      {/* Polite live region — announces refreshed totals without stealing focus */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveSummary}
      </p>

      {/* Headline metrics */}
      <section className="live-pnl__metrics" aria-label="Live performance summary">
        <article className="live-pnl__metric" aria-label="Total net worth">
          <p className="live-pnl__metric-label">Total Net Worth</p>
          <p className="live-pnl__metric-value">
            <CurrencyDisplay
              amount={view.totalNetWorthCents}
              currency={currency}
              context="total net worth"
            />
          </p>
          <p className="live-pnl__metric-sub">
            <CurrencyDisplay
              amount={view.investedValueCents}
              currency={currency}
              context="invested value"
            />{' '}
            invested
          </p>
        </article>

        <article className="live-pnl__metric" aria-label="Today's profit and loss">
          <p className="live-pnl__metric-label">Today&apos;s P&amp;L</p>
          <p className="live-pnl__metric-value">
            <PnlFigure
              amountCents={view.dayPnlCents}
              indicator={view.indicators.day}
              currency={currency}
              context="today's profit and loss"
              showTag
            />
          </p>
          <p className="live-pnl__metric-sub">
            {view.dayPnlPercent >= 0 ? '+' : '−'}
            {Math.abs(view.dayPnlPercent)}% of start-of-day net worth
          </p>
        </article>

        <article className="live-pnl__metric" aria-label="Unrealized profit and loss">
          <p className="live-pnl__metric-label">Unrealized P&amp;L</p>
          <p className="live-pnl__metric-value">
            <PnlFigure
              amountCents={view.unrealizedPnlCents}
              indicator={view.indicators.unrealized}
              currency={currency}
              context="unrealized profit and loss"
              showTag
            />
          </p>
          <p className="live-pnl__metric-sub">Open positions vs. cost basis</p>
        </article>

        <article className="live-pnl__metric" aria-label="Realized profit and loss">
          <p className="live-pnl__metric-label">Realized P&amp;L (today)</p>
          <p className="live-pnl__metric-value">
            <PnlFigure
              amountCents={view.realizedPnlCents}
              indicator={view.indicators.realized}
              currency={currency}
              context="realized profit and loss today"
              showTag
            />
          </p>
          <p className="live-pnl__metric-sub">Closed trades booked today</p>
        </article>
      </section>

      {/* Breakdowns */}
      <section className="live-pnl__section" aria-label="Profit and loss by brokerage">
        <h2 className="live-pnl__section-title">By Brokerage</h2>
        <BreakdownTable
          id="pnl-by-brokerage"
          caption="Market value and intraday P&L for each brokerage."
          columnLabel="Brokerage"
          rows={view.report.breakdowns.byBrokerage}
          currency={currency}
        />
      </section>

      <section className="live-pnl__section" aria-label="Profit and loss by asset class">
        <h2 className="live-pnl__section-title">By Asset Class</h2>
        <BreakdownTable
          id="pnl-by-asset-class"
          caption="Market value and intraday P&L grouped by asset class, including volatile crypto."
          columnLabel="Asset class"
          rows={view.report.breakdowns.byAssetClass}
          currency={currency}
          labelFor={(key) => ASSET_CLASS_LABEL[key] ?? key}
        />
      </section>

      <section className="live-pnl__section" aria-label="Profit and loss by symbol">
        <h2 className="live-pnl__section-title">By Symbol</h2>
        <BreakdownTable
          id="pnl-by-symbol"
          caption="Market value and intraday P&L for each holding. Stale or missing quotes are flagged."
          columnLabel="Symbol"
          rows={view.report.breakdowns.bySymbol}
          currency={currency}
          staleKeys={[...view.staleness.staleSymbols, ...view.staleness.missingSymbols]}
        />
      </section>
    </div>
  );
};

export default LivePnlDashboard;
