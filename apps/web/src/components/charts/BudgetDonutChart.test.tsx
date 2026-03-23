// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BudgetDonutChart, type BudgetSlice } from './BudgetDonutChart';

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
    PieChart: mock('PieChart'),
    Pie: mock('Pie'),
    Cell: mock('Cell'),
    Tooltip: mock('Tooltip'),
    Label: mock('Label'),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleData: BudgetSlice[] = [
  { name: 'Housing', value: 1200 },
  { name: 'Groceries', value: 400 },
  { name: 'Savings', value: 600 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BudgetDonutChart', () => {
  // -- Renders with valid data ------------------------------------------------

  it('renders with budget data and default title', () => {
    render(<BudgetDonutChart data={sampleData} />);
    expect(screen.getByText('Budget breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('ResponsiveContainer')).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<BudgetDonutChart data={sampleData} title="Q1 Budget" />);
    expect(screen.getByText('Q1 Budget')).toBeInTheDocument();
  });

  // -- Empty state ------------------------------------------------------------

  it('handles empty data', () => {
    render(<BudgetDonutChart data={[]} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-label', 'Donut chart with no data.');
  });

  // -- Accessibility ----------------------------------------------------------

  it('has an accessible container with role="figure"', () => {
    render(<BudgetDonutChart data={sampleData} />);
    const container = screen.getByRole('figure');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-roledescription', 'donut chart');
  });

  it('generates aria-label describing categories and total', () => {
    render(<BudgetDonutChart data={sampleData} />);
    const container = screen.getByRole('figure');
    const label = container.getAttribute('aria-label')!;
    expect(label).toContain('3 categories');
    expect(label).toContain('$2,200');
    expect(label).toContain('Housing');
    expect(label).toContain('Groceries');
    expect(label).toContain('Savings');
  });

  it('includes a sr-only description paragraph', () => {
    render(<BudgetDonutChart data={sampleData} />);
    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).toBeInTheDocument();
    expect(srOnly!.textContent).toContain('3 categories');
  });
});
