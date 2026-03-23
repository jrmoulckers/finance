// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TrendLineChart, type TrendDataPoint, type TrendSeries } from './TrendLineChart';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

/** Stub window.matchMedia so prefers-reduced-motion checks don't throw. */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
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

/** Mock Recharts — canvas/SVG APIs are unavailable in jsdom. */
vi.mock('recharts', async () => {
  const R = await import('react');
  const mock = (name: string) =>
    function MockComponent(props: Record<string, unknown>) {
      return R.createElement('div', { 'data-testid': name }, props.children as React.ReactNode);
    };
  return {
    ResponsiveContainer: mock('ResponsiveContainer'),
    LineChart: mock('LineChart'),
    Line: mock('Line'),
    XAxis: mock('XAxis'),
    YAxis: mock('YAxis'),
    CartesianGrid: mock('CartesianGrid'),
    Tooltip: mock('Tooltip'),
    Legend: mock('Legend'),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleData: TrendDataPoint[] = [
  { label: 'Jan', income: 4000, expenses: 2400 },
  { label: 'Feb', income: 3000, expenses: 1398 },
  { label: 'Mar', income: 5000, expenses: 3200 },
];

const sampleSeries: TrendSeries[] = [
  { dataKey: 'income', name: 'Income' },
  { dataKey: 'expenses', name: 'Expenses' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrendLineChart', () => {
  // -- Renders with valid data ------------------------------------------------

  it('renders with valid data and default title', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    expect(screen.getByText('Trend over time')).toBeInTheDocument();
    expect(screen.getByTestId('ResponsiveContainer')).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} title="Monthly Income" />);
    expect(screen.getByText('Monthly Income')).toBeInTheDocument();
  });

  // -- Empty state ------------------------------------------------------------

  it('renders empty state with no data', () => {
    render(<TrendLineChart data={[]} series={sampleSeries} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-label', 'Line chart with no data.');
  });

  // -- Accessibility ----------------------------------------------------------

  it('has an accessible container with role="figure"', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    const container = screen.getByRole('figure');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-roledescription', 'line chart');
  });

  it('generates aria-label describing data points and series ranges', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    const container = screen.getByRole('figure');
    const label = container.getAttribute('aria-label')!;
    expect(label).toContain('3 data points');
    expect(label).toContain('2 series');
    expect(label).toContain('Income');
    expect(label).toContain('Expenses');
  });

  it('includes a sr-only description paragraph', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).toBeInTheDocument();
    expect(srOnly!.textContent).toContain('3 data points');
  });
});
