// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import {
  HoldingsTable,
  VIRTUALIZE_THRESHOLD,
  type HoldingRow,
} from './HoldingsTable';

function makeRow(index: number): HoldingRow {
  return {
    key: `row-${index}`,
    to: `/investments/inv-${index}`,
    symbol: `SYM${index}`,
    name: `Security ${index}`,
    iconName: 'trending-up',
    typeLabel: 'Stock',
    accountLabel: 'Fidelity',
    shares: 10,
    pricePerShareCents: 10000,
    currencyCode: 'USD',
    marketValueCents: 100000,
    gainLossCents: 5000,
    gainLossPercent: 5,
  };
}

function renderTable(rowCount: number, extra: Partial<React.ComponentProps<typeof HoldingsTable>> = {}) {
  const rows = Array.from({ length: rowCount }, (_, i) => makeRow(i));
  const onSort = vi.fn();
  render(
    <MemoryRouter>
      <HoldingsTable
        rows={rows}
        sortField="symbol"
        sortDirection="asc"
        onSort={onSort}
        accountColumnLabel="Account"
        {...extra}
      />
    </MemoryRouter>,
  );
  return { rows, onSort };
}

describe('HoldingsTable', () => {
  it('renders every row for small portfolios (no virtualization)', () => {
    renderTable(10);
    expect(screen.getAllByTestId('holding-row')).toHaveLength(10);
  });

  it('renders only a small window of rows for large portfolios (#3272)', () => {
    const total = 1000;
    renderTable(total);
    const rendered = screen.getAllByTestId('holding-row');
    // Far fewer rows than the full portfolio should be mounted.
    expect(rendered.length).toBeLessThan(total);
    expect(rendered.length).toBeLessThan(50);
    // The header exposes the true total row count for assistive tech.
    expect(screen.getByLabelText('Investment holdings table')).toHaveAttribute(
      'aria-rowcount',
      String(total),
    );
  });

  it('keeps sortable column headers accessible even when virtualized', () => {
    const { onSort } = renderTable(VIRTUALIZE_THRESHOLD + 50);
    const symbolHeader = screen.getByRole('button', { name: /sort by symbol/i });
    fireEvent.click(symbolHeader);
    expect(onSort).toHaveBeenCalledWith('symbol');

    fireEvent.click(screen.getByRole('button', { name: /sort by market value/i }));
    expect(onSort).toHaveBeenCalledWith('value');

    fireEvent.click(screen.getByRole('button', { name: /sort by gain\/loss/i }));
    expect(onSort).toHaveBeenCalledWith('gainLoss');
  });

  it('shows the account column label and per-row account attribution (#3262)', () => {
    renderTable(3);
    expect(screen.getByRole('columnheader', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getAllByText('Fidelity').length).toBe(3);
  });

  it('renders a dash for blended roll-up price and a custom account column label', () => {
    const rows: HoldingRow[] = [
      {
        key: 'AAPL|USD',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        iconName: 'trending-up',
        typeLabel: 'Stock',
        accountLabel: '2 accounts',
        shares: 15,
        pricePerShareCents: null,
        currencyCode: 'USD',
        marketValueCents: 300000,
        gainLossCents: 75000,
        gainLossPercent: 33.33,
      },
    ];
    render(
      <MemoryRouter>
        <HoldingsTable
          rows={rows}
          sortField="value"
          sortDirection="desc"
          onSort={vi.fn()}
          accountColumnLabel="Accounts"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('columnheader', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByText('2 accounts')).toBeInTheDocument();
  });
});
