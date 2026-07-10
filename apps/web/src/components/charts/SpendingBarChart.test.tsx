// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SpendingBarChart, type SpendingCategory } from './SpendingBarChart';

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
    BarChart: mock('BarChart'),
    Bar: mock('Bar'),
    XAxis: mock('XAxis'),
    YAxis: mock('YAxis'),
    CartesianGrid: mock('CartesianGrid'),
    Tooltip: mock('Tooltip'),
    Cell: mock('Cell'),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleData: SpendingCategory[] = [
  { name: 'Food', amount: 450 },
  { name: 'Transport', amount: 200 },
  { name: 'Entertainment', amount: 150 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpendingBarChart', () => {
  // -- Renders with valid data ------------------------------------------------

  it('renders with category spending data', () => {
    render(<SpendingBarChart data={sampleData} />);
    expect(screen.getByText('Spending by category')).toBeInTheDocument();
    expect(screen.getByTestId('ResponsiveContainer')).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<SpendingBarChart data={sampleData} title="March Spending" />);
    expect(screen.getByText('March Spending')).toBeInTheDocument();
  });

  // -- Empty state ------------------------------------------------------------

  it('handles empty data', () => {
    render(<SpendingBarChart data={[]} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute(
      'aria-label',
      'Spending by category: No data to display yet.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('No data to display yet.');
  });

  // -- Accessibility ----------------------------------------------------------

  it('has an accessible container with role="figure"', () => {
    render(<SpendingBarChart data={sampleData} />);
    const container = screen.getByRole('figure');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-roledescription', 'bar chart');
  });

  it('generates aria-label describing categories and total', () => {
    render(<SpendingBarChart data={sampleData} />);
    const container = screen.getByRole('figure');
    const label = container.getAttribute('aria-label')!;
    expect(label).toContain('3 categories');
    expect(label).toContain('$800');
    expect(label).toContain('Food');
    expect(label).toContain('Transport');
    expect(label).toContain('Entertainment');
  });

  it('includes a sr-only description paragraph', () => {
    render(<SpendingBarChart data={sampleData} />);
    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).toBeInTheDocument();
    expect(srOnly!.textContent).toContain('3 categories');
  });

  it('provides a live region for focused category announcements', () => {
    render(<SpendingBarChart data={sampleData} />);

    expect(screen.getByRole('status', { name: /chart point announcement/i })).toHaveAttribute(
      'aria-live',
      'polite',
    );
  });

  it('exposes a visually-hidden data table with a row per category', () => {
    render(<SpendingBarChart data={sampleData} title="March Spending" />);

    const table = screen.getByRole('table', { name: /march spending data table/i });
    expect(table).toBeInTheDocument();
    // One row header cell per category (plus the column header row).
    expect(screen.getByRole('rowheader', { name: 'Food' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Transport' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Entertainment' })).toBeInTheDocument();
    // Amount and share are rendered so screen-reader users can read every value.
    expect(screen.getByRole('row', { name: /Food/ })).toHaveTextContent('$450');
    expect(screen.getByRole('row', { name: /Food/ })).toHaveTextContent('56.3%');
  });

  it('omits the data table when there is no data', () => {
    render(<SpendingBarChart data={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
