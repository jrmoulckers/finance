// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for FirePlannerPage.
 *
 * The projection chart is mocked (it internally uses Recharts, which needs a
 * real layout engine) so these tests focus on the calculator wiring: inputs
 * drive the engine and the results render and update live.
 *
 * References: issue #2114
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { FirePlannerPage } from './FirePlannerPage';

// Mock the chart barrel so we don't pull Recharts into jsdom.
vi.mock('../components/charts', () => ({
  TrendLineChart: () => <div data-testid="fire-projection-chart" />,
}));

describe('FirePlannerPage', () => {
  it('renders the planner with labelled inputs', () => {
    render(<FirePlannerPage />);

    expect(screen.getByRole('heading', { name: 'FIRE Planner', level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText('Current invested assets')).toBeInTheDocument();
    expect(screen.getByLabelText('Annual spending in retirement')).toBeInTheDocument();
    expect(screen.getByLabelText('Annual contributions')).toBeInTheDocument();
    expect(screen.getByLabelText('Expected real return')).toBeInTheDocument();
    expect(screen.getByLabelText('Safe withdrawal rate (SWR)')).toBeInTheDocument();
  });

  it('computes the FI number from the default inputs ($40k @ 4% → $1M)', () => {
    render(<FirePlannerPage />);

    const fiCard = screen.getByRole('article', { name: 'Financial independence number' });
    expect(within(fiCard).getByText(/1,000,000/)).toBeInTheDocument();
  });

  it('recomputes the FI number live when annual spending changes', () => {
    render(<FirePlannerPage />);

    fireEvent.change(screen.getByLabelText('Annual spending in retirement'), {
      target: { value: '50000' },
    });

    const fiCard = screen.getByRole('article', { name: 'Financial independence number' });
    // $50,000 / 4% = $1,250,000.
    expect(within(fiCard).getByText(/1,250,000/)).toBeInTheDocument();
  });

  it('shows a Coast-FI status conveyed with text (not colour alone)', () => {
    render(<FirePlannerPage />);

    const coastCard = screen.getByRole('article', {
      name: 'Coast financial independence number',
    });
    // $100k today is below the ~$231k coast number at the default inputs.
    expect(within(coastCard).getByText(/Not yet Coast FI/)).toBeInTheDocument();
  });

  it('renders the projection chart when FI is reachable', () => {
    render(<FirePlannerPage />);
    expect(screen.getByTestId('fire-projection-chart')).toBeInTheDocument();
  });

  it('announces results in a live status region', () => {
    render(<FirePlannerPage />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/FI number/i);
  });

  it('guards against a non-positive safe withdrawal rate', () => {
    render(<FirePlannerPage />);

    fireEvent.change(screen.getByLabelText('Safe withdrawal rate (SWR)'), {
      target: { value: '0' },
    });

    const fiCard = screen.getByRole('article', { name: 'Financial independence number' });
    expect(within(fiCard).getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/withdrawal rate above 0%/i);
  });
});
