// SPDX-License-Identifier: BUSL-1.1

/**
 * Render tests for TripBudgetsPage.
 *
 * The page is fully self-contained (pure engine + local state, no hooks or
 * repositories), so these tests exercise the real wiring: labelled inputs,
 * the seeded worked example, the aria-live roll-up, creating a trip, logging
 * spend, archiving, and filtering the ledger.
 *
 * References: issue #2205
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { TripBudgetsPage } from './TripBudgetsPage';

describe('TripBudgetsPage', () => {
  it('renders the page heading and labelled create-trip inputs', () => {
    render(<TripBudgetsPage />);

    expect(
      screen.getByRole('heading', { name: 'Trip & Country Budgets', level: 2 }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Trip name')).toBeInTheDocument();
    expect(screen.getByLabelText('Country / region')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(screen.getByLabelText('Local currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Home currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Planned amount (local currency)')).toBeInTheDocument();
    expect(screen.getByLabelText('FX rate (home per 1 local)')).toBeInTheDocument();
  });

  it('exposes the home-currency roll-up in an aria-live status region', () => {
    render(<TripBudgetsPage />);

    const status = screen.getByRole('status', { name: 'Home-currency roll-up' });
    expect(status).toHaveAttribute('aria-live', 'polite');
    // Seeded Bangkok trip: ฿20,500 spent rolls up to $574 of $2,520 planned.
    expect(status).toHaveTextContent(/\$574\.00/);
    expect(status).toHaveTextContent(/\$2,520\.00/);
  });

  it('shows the seeded trip with local spend and home-currency roll-up', () => {
    render(<TripBudgetsPage />);

    const card = screen
      .getByRole('heading', { name: 'Bangkok Jan–Mar', level: 4 })
      .closest('article') as HTMLElement;

    expect(within(card).getByText(/20,500/)).toBeInTheDocument(); // local spend
    expect(within(card).getByText(/\$574\.00/)).toBeInTheDocument(); // home roll-up
    expect(within(card).getByText('2 transactions')).toBeInTheDocument();
  });

  it('validates the create-trip form and surfaces an alert', () => {
    render(<TripBudgetsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Create trip envelope' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give the trip a name.');
  });

  it('creates a new trip envelope from the form', () => {
    render(<TripBudgetsPage />);

    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Lisbon Spring' } });
    fireEvent.change(screen.getByLabelText('Country / region'), { target: { value: 'Portugal' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-30' } });
    fireEvent.change(screen.getByLabelText('Local currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByLabelText('Planned amount (local currency)'), {
      target: { value: '2000' },
    });
    fireEvent.change(screen.getByLabelText('FX rate (home per 1 local)'), {
      target: { value: '1.08' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create trip envelope' }));

    expect(screen.getByRole('heading', { name: 'Lisbon Spring', level: 4 })).toBeInTheDocument();
  });

  it('logs local-currency spend and updates the trip transaction count', () => {
    render(<TripBudgetsPage />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-02-20' } });
    fireEvent.change(screen.getByLabelText('Amount (local currency)'), {
      target: { value: '1500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add spend' }));

    const card = screen
      .getByRole('heading', { name: 'Bangkok Jan–Mar', level: 4 })
      .closest('article') as HTMLElement;
    expect(within(card).getByText('3 transactions')).toBeInTheDocument();
  });

  it('archives a finished trip and offers to reopen it', () => {
    render(<TripBudgetsPage />);

    fireEvent.click(screen.getByRole('button', { name: /^Archive Bangkok Jan/ }));

    expect(screen.getByRole('heading', { name: 'Archived trips', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reopen Bangkok Jan/ })).toBeInTheDocument();
  });

  it('renders an accessible spend ledger with a caption and trip filter', () => {
    render(<TripBudgetsPage />);

    expect(screen.getByLabelText('Filter by trip')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/Spend entries/)).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Amount' })).toBeInTheDocument();
    // Two seeded rows in the tbody.
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 data rows
  });
});
