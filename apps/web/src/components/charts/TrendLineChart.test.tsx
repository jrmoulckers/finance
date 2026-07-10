// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { TrendLineChart, type TrendDataPoint, type TrendSeries } from './TrendLineChart';
import { PrivacyModeProvider } from '../../contexts/PrivacyModeContext';

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

  it('renders a pattern-encoded legend so series are distinguishable without colour (WCAG 1.4.1)', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    const legend = screen.getByRole('list', { name: /Trend over time legend/i });
    expect(legend).toBeInTheDocument();
    // Each series names its stroke pattern in text, not colour alone.
    expect(screen.getByText('Income (solid line)')).toBeInTheDocument();
    expect(screen.getByText('Expenses (dashed line)')).toBeInTheDocument();
  });

  it('applies a distinct stroke pattern per series line', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    // The legend swatch mirrors each line: first series solid (no dasharray),
    // second dashed.
    const swatchLines = document.querySelectorAll('.trend-chart__legend-swatch line');
    expect(swatchLines).toHaveLength(2);
    expect(swatchLines[0].getAttribute('stroke-dasharray')).toBeNull();
    expect(swatchLines[1].getAttribute('stroke-dasharray')).toBe('6 5');
  });

  it('describes each series line pattern in the chart summary', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    const label = screen.getByRole('figure').getAttribute('aria-label')!;
    expect(label).toContain('Income (solid line)');
    expect(label).toContain('Expenses (dashed line)');
  });

  it('includes a sr-only description paragraph', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);
    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).toBeInTheDocument();
    expect(srOnly!.textContent).toContain('3 data points');
  });

  it('renders a keyboard-focusable chart navigator and accessible data table', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);

    const navigator = screen.getByRole('group', { name: /Trend over time data navigator/i });
    expect(navigator).toHaveAttribute('tabindex', '0');

    const table = screen.getByRole('table', { name: /Trend over time data table/i });
    expect(table).toBeInTheDocument();
    expect(screen.getByText('Jan').closest('tr')).toHaveAttribute(
      'aria-label',
      'Jan: Income $4,000, Expenses $2,400',
    );
  });

  it('announces the active data point when arrow keys move between points', () => {
    render(<TrendLineChart data={sampleData} series={sampleSeries} />);

    const navigator = screen.getByRole('group', { name: /Trend over time data navigator/i });
    fireEvent.focus(navigator);
    expect(screen.getByRole('status')).toHaveTextContent('Focused point 1 of 3.');
    expect(screen.getByRole('status')).toHaveTextContent('Income Jan: $4,000');

    fireEvent.keyDown(navigator, { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent('Focused point 2 of 3.');
    expect(screen.getByRole('status')).toHaveTextContent('Expenses Feb: $1,398');
  });

  // -- Privacy masking --------------------------------------------------------

  it('masks currency values in the data table when privacy mode is active', () => {
    render(
      <PrivacyModeProvider initialValue>
        <TrendLineChart data={sampleData} series={sampleSeries} />
      </PrivacyModeProvider>,
    );

    const janRow = screen.getByText('Jan').closest('tr')!;
    expect(janRow).toHaveTextContent('•••');
    expect(janRow.getAttribute('aria-label')).not.toContain('$4,000');
  });
});
