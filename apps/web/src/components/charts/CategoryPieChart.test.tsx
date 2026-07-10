// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CategoryPieChart, type CategorySlice } from './CategoryPieChart';

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

// CategoryPieChart uses D3 (not Recharts) — D3 DOM manipulation works in jsdom
// so no recharts mock is needed here.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleData: CategorySlice[] = [
  { name: 'Food', value: 450 },
  { name: 'Transport', value: 200 },
  { name: 'Entertainment', value: 150 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategoryPieChart', () => {
  // -- Renders with valid data ------------------------------------------------

  it('renders with category data and default title', () => {
    render(<CategoryPieChart data={sampleData} />);
    expect(screen.getByText('Spending by category')).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<CategoryPieChart data={sampleData} title="Q1 Breakdown" />);
    expect(screen.getByText('Q1 Breakdown')).toBeInTheDocument();
  });

  it('renders an SVG element with role="img"', () => {
    const { container } = render(<CategoryPieChart data={sampleData} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('role', 'img');
  });

  it('creates D3 path elements for each data slice', () => {
    const { container } = render(<CategoryPieChart data={sampleData} />);
    const paths = container.querySelectorAll('path[data-chart-point]');
    expect(paths).toHaveLength(sampleData.length);
  });

  it('assigns aria-label to each D3-generated slice', () => {
    const { container } = render(<CategoryPieChart data={sampleData} />);
    const paths = container.querySelectorAll('path[role="listitem"]');
    expect(paths).toHaveLength(sampleData.length);
    expect(paths[0].getAttribute('aria-label')).toContain('Food');
    expect(paths[1].getAttribute('aria-label')).toContain('Transport');
    expect(paths[2].getAttribute('aria-label')).toContain('Entertainment');
  });

  // -- Empty state ------------------------------------------------------------

  it('handles empty data', () => {
    render(<CategoryPieChart data={[]} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute(
      'aria-label',
      'Spending by category: No data to display yet.',
    );
    expect(screen.getByRole('status')).toHaveTextContent('No data to display yet.');
  });

  it('renders no path elements when data is empty', () => {
    const { container } = render(<CategoryPieChart data={[]} />);
    const paths = container.querySelectorAll('path[data-chart-point]');
    expect(paths).toHaveLength(0);
  });

  // -- Accessibility ----------------------------------------------------------

  it('has an accessible container with role="figure"', () => {
    render(<CategoryPieChart data={sampleData} />);
    const container = screen.getByRole('figure');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('aria-roledescription', 'pie chart');
  });

  it('generates aria-label describing categories and total', () => {
    render(<CategoryPieChart data={sampleData} />);
    const container = screen.getByRole('figure');
    const label = container.getAttribute('aria-label')!;
    expect(label).toContain('3 categories');
    expect(label).toContain('$800');
  });

  it('includes a sr-only description paragraph', () => {
    render(<CategoryPieChart data={sampleData} />);
    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).toBeInTheDocument();
    expect(srOnly!.textContent).toContain('3 categories');
  });

  it('announces focused slices through a live region', () => {
    const { container } = render(<CategoryPieChart data={sampleData} />);
    const firstSlice = container.querySelector<SVGPathElement>('path[data-chart-point]');

    expect(firstSlice).not.toBeNull();
    fireEvent.focus(firstSlice!);

    expect(screen.getByRole('status', { name: /chart point announcement/i })).toHaveTextContent(
      'Food: $450 (56.3%)',
    );
  });

  it('renders a screen-reader data-table alternative listing each category', () => {
    render(<CategoryPieChart data={sampleData} />);
    const table = screen.getByRole('table', { name: /spending by category data table/i });
    expect(within(table).getByRole('rowheader', { name: 'Food' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Transport' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Entertainment' })).toBeInTheDocument();
    expect(within(table).getByText('$450')).toBeInTheDocument();
    expect(within(table).getByText('56.3%')).toBeInTheDocument();
  });

  it('omits the data table when there is no data', () => {
    render(<CategoryPieChart data={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
