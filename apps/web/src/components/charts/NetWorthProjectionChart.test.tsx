// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for NetWorthProjectionChart.
 *
 * Recharts SVG APIs are unavailable in jsdom, so the chart primitives are
 * mocked (matching the project's other chart tests). Behaviour, accessibility
 * structure, and the actual-vs-projected distinction are asserted via the DOM.
 *
 * References: issue #2116
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NetWorthProjectionChart } from './NetWorthProjectionChart';
import type { NetWorthSeriesPoint } from '../../lib/visualization/net-worth-projection';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock('recharts', async () => {
  const React = await import('react');
  const mock = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      const label = props.label as { value?: unknown } | undefined;
      const labelText =
        label && typeof label === 'object' && 'value' in label ? String(label.value) : undefined;
      return React.createElement(
        'div',
        { 'data-testid': name, 'data-label': labelText },
        props.children as never,
      );
    };
  return {
    ResponsiveContainer: mock('ResponsiveContainer'),
    LineChart: mock('LineChart'),
    Line: mock('Line'),
    XAxis: mock('XAxis'),
    YAxis: mock('YAxis'),
    CartesianGrid: mock('CartesianGrid'),
    Tooltip: mock('Tooltip'),
    ReferenceLine: mock('ReferenceLine'),
  };
});

function makeHistory(values: number[], startIso = '2026-01-15'): NetWorthSeriesPoint[] {
  const base = new Date(`${startIso}T00:00:00.000Z`);
  return values.map((netWorthCents, index) => {
    const date = new Date(base);
    date.setUTCMonth(base.getUTCMonth() + index);
    return {
      label: date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      netWorthCents,
      dateIso: date.toISOString().slice(0, 10),
    };
  });
}

const GROWING = makeHistory([1_000_000, 1_250_000, 1_500_000, 1_750_000, 2_000_000, 2_250_000]);

describe('NetWorthProjectionChart', () => {
  it('renders the title and a keyboard-operable range selector', () => {
    render(<NetWorthProjectionChart history={GROWING} />);

    const group = screen.getByRole('group', { name: 'Projection range' });
    expect(group).toBeInTheDocument();
    expect(within(group).getAllByRole('button')).toHaveLength(4);
    expect(within(group).getByRole('button', { name: /last 3 months/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /all history/i })).toBeInTheDocument();
    // Default range is pre-selected.
    expect(within(group).getByRole('button', { name: /last 6 months/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('conveys actual vs projected with a pattern-based legend, not color alone', () => {
    render(<NetWorthProjectionChart history={GROWING} />);
    expect(screen.getByText(/Actual net worth \(solid line\)/)).toBeInTheDocument();
    expect(screen.getByText(/Projected forecast \(dashed line\)/)).toBeInTheDocument();
  });

  it('shows the derived pace assumptions and a not-advice disclaimer', () => {
    render(<NetWorthProjectionChart history={GROWING} />);
    const assumptions = screen.getByText(/Forecast assumes a steady/);
    expect(assumptions).toHaveTextContent(/growth/);
    expect(assumptions).toHaveTextContent(/not financial advice/i);
  });

  it('lists actual and projected points in an accessible data table', () => {
    render(<NetWorthProjectionChart history={GROWING} />);
    const table = screen.getByRole('table', { name: /data table/ });
    expect(within(table).getAllByText('Actual').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Projected').length).toBeGreaterThan(0);
  });

  it('updates the selection when a different range is chosen', () => {
    render(<NetWorthProjectionChart history={GROWING} />);
    const threeMonth = screen.getByRole('button', { name: /last 3 months/ });
    fireEvent.click(threeMonth);
    expect(threeMonth).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /last 6 months/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows a friendly message instead of a projection for short history', () => {
    render(<NetWorthProjectionChart history={makeHistory([1_000_000])} />);
    expect(screen.getByText(/At least two months of net-worth history/)).toBeInTheDocument();
    expect(screen.queryByText(/Forecast assumes/)).not.toBeInTheDocument();
  });

  it('shows an empty state when there is no history at all', () => {
    render(<NetWorthProjectionChart history={[]} />);
    expect(screen.getByText(/Add account balances and transactions/)).toBeInTheDocument();
  });

  it('draws a labeled break-even reference line only when net worth is underwater', () => {
    // Climbing but still-negative history crosses $0 in view.
    const { container, rerender } = render(
      <NetWorthProjectionChart
        history={makeHistory([-2_600_000, -2_400_000, -2_000_000, -1_500_000])}
      />,
    );
    expect(container.querySelector('[data-label="Break-even ($0)"]')).not.toBeNull();

    // A purely-positive series keeps full vertical resolution — no zero line.
    rerender(<NetWorthProjectionChart history={GROWING} />);
    expect(container.querySelector('[data-label="Break-even ($0)"]')).toBeNull();
  });
});
