// SPDX-License-Identifier: BUSL-1.1

/**
 * Investment holdings table (issues #3272, #3262).
 *
 * - #3272: virtualizes the row list for large portfolios so only the rows near
 *   the viewport are mounted, while preserving native `<table>` semantics and
 *   accessible sortable column headers. Virtualization only kicks in above a row
 *   threshold; smaller portfolios render every row as before.
 * - #3262: shows the owning account/brokerage per holding and supports a
 *   group-by-symbol roll-up that consolidates a ticker held across accounts into
 *   one line showing total exposure and the number of contributing accounts.
 */

import React from 'react';
import { Link } from 'react-router';

import { CurrencyDisplay } from '../common';
import { AppIcon, type IconName } from '../icons';
import { useVirtualList } from '../../hooks/useVirtualList';

/** A normalized, render-ready holdings row (detail position or roll-up line). */
export interface HoldingRow {
  /** Stable React key. */
  readonly key: string;
  /** Detail-row link target; omitted for roll-up lines. */
  readonly to?: string;
  readonly symbol: string;
  readonly name: string;
  readonly iconName: IconName;
  readonly typeLabel: string;
  /** Account/brokerage label (e.g. "Fidelity") or roll-up account summary. */
  readonly accountLabel: string;
  readonly shares: number;
  /** Price per share in cents; `null` for blended roll-up lines. */
  readonly pricePerShareCents: number | null;
  readonly currencyCode: string;
  readonly marketValueCents: number;
  readonly gainLossCents: number;
  readonly gainLossPercent: number;
}

export type HoldingsSortField = 'symbol' | 'value' | 'gainLoss';

export interface HoldingsTableProps {
  readonly rows: readonly HoldingRow[];
  readonly sortField: HoldingsSortField;
  readonly sortDirection: 'asc' | 'desc';
  readonly onSort: (field: HoldingsSortField) => void;
  /** Header label for the second column (Account vs. Accounts in roll-up mode). */
  readonly accountColumnLabel: string;
}

/**
 * Row count above which the body is virtualized. Chosen so typical portfolios
 * render in full (keeping the DOM simple and every row printable) while very
 * large portfolios avoid mounting thousands of rows at once.
 */
export const VIRTUALIZE_THRESHOLD = 100;

/** Fixed height (px) used for each virtualized row's spacer math. */
export const ROW_HEIGHT = 68;

/** Height (px) of the scrollable viewport when virtualizing. */
const VIEWPORT_HEIGHT = 612;

const CELL_STYLE: React.CSSProperties = { padding: 'var(--spacing-3)' };
const HEADER_BORDER = '2px solid var(--semantic-border-default, #e5e7eb)';
const ROW_BORDER = '1px solid var(--semantic-border-default, #e5e7eb)';

const HEADER_BUTTON_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
  padding: 0,
};

function formatSignedCents(cents: number, currencyCode: string): string {
  const sign = cents >= 0 ? '+' : '−';
  const abs = Math.abs(cents) / 100;
  return `${sign}${abs.toLocaleString(undefined, {
    style: 'currency',
    currency: currencyCode,
  })}`;
}

const HoldingCells: React.FC<{ row: HoldingRow }> = ({ row }) => {
  const gainLoss = row.gainLossCents;
  const symbolContent = (
    <>
      <AppIcon name={row.iconName} /> <strong>{row.symbol}</strong>
      <br />
      <span
        style={{
          fontSize: 'var(--type-scale-caption-font-size)',
          color: 'var(--semantic-text-secondary)',
        }}
      >
        {row.name}
      </span>
    </>
  );

  return (
    <>
      <td style={CELL_STYLE}>
        {row.to ? (
          <Link
            to={row.to}
            style={{ textDecoration: 'none', color: 'inherit' }}
            aria-label={`View details for ${row.name} (${row.symbol})`}
          >
            {symbolContent}
          </Link>
        ) : (
          symbolContent
        )}
      </td>
      <td style={CELL_STYLE}>{row.accountLabel}</td>
      <td style={CELL_STYLE}>{row.typeLabel}</td>
      <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
        {row.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </td>
      <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
        {row.pricePerShareCents === null ? (
          <span aria-hidden="true">—</span>
        ) : (
          <CurrencyDisplay amount={row.pricePerShareCents} currency={row.currencyCode} />
        )}
      </td>
      <td style={{ ...CELL_STYLE, textAlign: 'right' }}>
        <CurrencyDisplay amount={row.marketValueCents} currency={row.currencyCode} />
      </td>
      <td
        style={{
          ...CELL_STYLE,
          textAlign: 'right',
          color:
            gainLoss >= 0
              ? 'var(--semantic-positive, #059669)'
              : 'var(--semantic-negative, #dc2626)',
        }}
      >
        {formatSignedCents(gainLoss, row.currencyCode)} ({row.gainLossPercent}%)
      </td>
    </>
  );
};

/** Investment holdings table with virtualization and account attribution. */
export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  rows,
  sortField,
  sortDirection,
  onSort,
  accountColumnLabel,
}) => {
  const sortArrow = sortDirection === 'asc' ? ' ↑' : ' ↓';
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

  const virtual = useVirtualList<HoldingRow>({
    items: rows as HoldingRow[],
    itemHeight: ROW_HEIGHT,
    containerHeight: VIEWPORT_HEIGHT,
    overscan: 6,
  });

  const renderedRows = shouldVirtualize ? virtual.visibleItems.map((v) => v.item) : rows;
  const topSpacer = shouldVirtualize ? virtual.startIndex * ROW_HEIGHT : 0;
  const bottomSpacer = shouldVirtualize
    ? Math.max(0, (rows.length - virtual.endIndex) * ROW_HEIGHT)
    : 0;

  const table = (
    <table
      style={{ width: '100%', borderCollapse: 'collapse' }}
      aria-label="Investment holdings table"
      aria-rowcount={rows.length}
    >
      <thead>
        <tr>
          <th
            scope="col"
            style={{
              textAlign: 'left',
              padding: 'var(--spacing-3)',
              cursor: 'pointer',
              borderBottom: HEADER_BORDER,
              userSelect: 'none',
              position: shouldVirtualize ? 'sticky' : undefined,
              top: shouldVirtualize ? 0 : undefined,
              background: shouldVirtualize ? 'var(--semantic-surface, #fff)' : undefined,
            }}
          >
            <button
              type="button"
              onClick={() => onSort('symbol')}
              aria-label={`Sort by symbol${sortField === 'symbol' ? sortArrow : ''}`}
              style={HEADER_BUTTON_STYLE}
            >
              Symbol{sortField === 'symbol' ? sortArrow : ''}
            </button>
          </th>
          <th
            scope="col"
            style={{ textAlign: 'left', padding: 'var(--spacing-3)', borderBottom: HEADER_BORDER }}
          >
            {accountColumnLabel}
          </th>
          <th
            scope="col"
            style={{ textAlign: 'left', padding: 'var(--spacing-3)', borderBottom: HEADER_BORDER }}
          >
            Type
          </th>
          <th
            scope="col"
            style={{ textAlign: 'right', padding: 'var(--spacing-3)', borderBottom: HEADER_BORDER }}
          >
            Shares
          </th>
          <th
            scope="col"
            style={{ textAlign: 'right', padding: 'var(--spacing-3)', borderBottom: HEADER_BORDER }}
          >
            Price
          </th>
          <th
            scope="col"
            style={{
              textAlign: 'right',
              padding: 'var(--spacing-3)',
              cursor: 'pointer',
              borderBottom: HEADER_BORDER,
              userSelect: 'none',
            }}
          >
            <button
              type="button"
              onClick={() => onSort('value')}
              aria-label={`Sort by market value${sortField === 'value' ? sortArrow : ''}`}
              style={HEADER_BUTTON_STYLE}
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
              borderBottom: HEADER_BORDER,
              userSelect: 'none',
            }}
          >
            <button
              type="button"
              onClick={() => onSort('gainLoss')}
              aria-label={`Sort by gain/loss${sortField === 'gainLoss' ? sortArrow : ''}`}
              style={HEADER_BUTTON_STYLE}
            >
              Gain/Loss{sortField === 'gainLoss' ? sortArrow : ''}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {topSpacer > 0 && (
          <tr aria-hidden="true" style={{ height: topSpacer }}>
            <td colSpan={7} style={{ padding: 0, border: 'none' }} />
          </tr>
        )}
        {renderedRows.map((row) => (
          <tr
            key={row.key}
            data-testid="holding-row"
            style={{
              borderBottom: ROW_BORDER,
              height: shouldVirtualize ? ROW_HEIGHT : undefined,
            }}
          >
            <HoldingCells row={row} />
          </tr>
        ))}
        {bottomSpacer > 0 && (
          <tr aria-hidden="true" style={{ height: bottomSpacer }}>
            <td colSpan={7} style={{ padding: 0, border: 'none' }} />
          </tr>
        )}
      </tbody>
    </table>
  );

  if (!shouldVirtualize) {
    return table;
  }

  return (
    <div
      ref={virtual.containerRef}
      onScroll={virtual.containerProps.onScroll}
      style={{ height: VIEWPORT_HEIGHT, overflow: 'auto', position: 'relative' }}
      role="group"
      aria-label={`Investment holdings (virtualized, ${rows.length} rows)`}
    >
      {table}
    </div>
  );
};

export default HoldingsTable;
