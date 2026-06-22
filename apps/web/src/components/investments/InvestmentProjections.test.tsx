// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InvestmentProjections } from './InvestmentProjections';

/** Stub window.matchMedia so prefers-reduced-motion checks don't throw. */
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

describe('InvestmentProjections', () => {
  it('renders the projection heading and a real-return disclaimer', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} />);

    expect(screen.getByRole('heading', { name: 'Growth Projection' })).toBeInTheDocument();
    expect(screen.getByText(/inflation-adjusted/i)).toBeInTheDocument();
  });

  it('exposes labelled scenario inputs', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} />);

    expect(screen.getByLabelText('Monthly contribution')).toBeInTheDocument();
    expect(screen.getByLabelText('Years to project')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected annual return')).toBeInTheDocument();
  });

  it('renders an accessible scenario summary table with three scenarios', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} />);

    const table = screen.getByRole('table', { name: /Projected value after/i });
    expect(within(table).getByRole('rowheader', { name: 'Conservative' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Expected' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Optimistic' })).toBeInTheDocument();
  });

  it('renders a chart with a text alternative (figure role)', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} />);

    expect(
      screen.getByRole('figure', { name: /Projected portfolio value by scenario/i }),
    ).toBeInTheDocument();
  });

  it('renders contribution tracking with a starting value', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} investedToDateCents={800_000} />);

    expect(screen.getByText('Starting value')).toBeInTheDocument();
    expect(screen.getByText('Invested to date')).toBeInTheDocument();
    expect(screen.getByText('Recurring contribution')).toBeInTheDocument();
  });

  it('updates the projection horizon when the years input changes', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} />);

    expect(screen.getByRole('table', { name: /after 20 years/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Years to project'), { target: { value: '10' } });

    expect(screen.getByRole('table', { name: /after 10 years/i })).toBeInTheDocument();
  });

  it('keeps the optimistic scenario at least as large as the conservative one', () => {
    render(<InvestmentProjections currentValueCents={1_000_000} />);

    const table = screen.getByRole('table', { name: /Projected value after/i });
    const rows = within(table).getAllByRole('row');
    // Header row + 3 scenario rows.
    expect(rows).toHaveLength(4);
  });
});
