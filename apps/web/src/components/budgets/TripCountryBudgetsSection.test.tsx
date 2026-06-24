// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TripCountryBudgetsSection } from './TripCountryBudgetsSection';
import type { TripBudgetView } from '../../lib/budgeting/trip-country-budgets';
import type { TripCountryBudget } from '../../lib/budgeting/trip-country-budgets';

function makeBudget(overrides: Partial<TripCountryBudget> = {}): TripCountryBudget {
  return {
    id: 'trip-thailand',
    name: 'Bangkok Jan–Mar',
    countries: ['TH'],
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    localCurrency: 'THB',
    displayCurrency: 'USD',
    tags: ['trip'],
    budgetLocalCents: 9_000_000,
    archived: false,
    createdAt: '2025-12-01T00:00:00Z',
    ...overrides,
  };
}

function makeView(overrides: Partial<TripBudgetView> = {}): TripBudgetView {
  const budget = overrides.budget ?? makeBudget();
  return {
    budget,
    rollup: {
      scopeId: budget.id,
      name: budget.name,
      includedTransactionIds: ['tx-1', 'tx-2'],
      localCurrency: 'THB',
      displayCurrency: 'USD',
      localSpendCents: 1_266_667,
      displaySpendCents: 38_000,
      isArchived: budget.archived ?? false,
      appearsInActiveAlerts: true,
    },
    budgetLocalCents: 9_000_000,
    localSpentCents: 1_266_667,
    remainingLocalCents: 7_733_333,
    displayCurrency: 'USD',
    budgetDisplayCents: 270_000,
    displaySpentCents: 38_000,
    remainingDisplayCents: 232_000,
    percentUsed: 14,
    isOverBudget: false,
    unconvertedCurrencies: [],
    displayConversionAvailable: true,
    ...overrides,
  };
}

const baseProps = {
  views: [] as readonly TripBudgetView[],
  countries: ['TH', 'VN'],
  countryFilter: '',
  onCountryFilterChange: vi.fn(),
  showArchived: false,
  onShowArchivedChange: vi.fn(),
  displayCurrency: 'USD',
  supportedCurrencies: [
    { value: 'USD', label: 'US Dollar (USD)' },
    { value: 'THB', label: 'Thai Baht (THB)' },
    { value: 'EUR', label: 'Euro (EUR)' },
  ],
  ratesStale: false,
  ratesLoading: false,
  today: '2026-02-01',
  onCreate: vi.fn(),
  onArchiveChange: vi.fn(),
  onDelete: vi.fn(),
};

describe('TripCountryBudgetsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the labelled creation form and filter controls', () => {
    render(<TripCountryBudgetsSection {...baseProps} />);

    expect(screen.getByRole('heading', { name: /trip & country budgets/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Trip name')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(screen.getByLabelText('Local currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Home roll-up currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Budget (local currency)')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by country')).toBeInTheDocument();
    expect(screen.getByLabelText('Show archived trips')).toBeInTheDocument();
  });

  it('renders a trip card with status, progressbar, and home roll-up', () => {
    render(<TripCountryBudgetsSection {...baseProps} views={[makeView()]} />);

    const card = screen.getByRole('article', { name: 'Bangkok Jan–Mar' });
    expect(within(card).getByText('Active')).toBeInTheDocument();
    const progress = within(card).getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '14');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
    expect(within(card).getByText('Home roll-up')).toBeInTheDocument();
    expect(within(card).getByText(/2 transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/showing 1 trip budget/i)).toBeInTheDocument();
  });

  it('parses the local amount into integer minor units on submit', () => {
    const onCreate = vi.fn();
    render(<TripCountryBudgetsSection {...baseProps} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Bangkok' } });
    fireEvent.change(screen.getByLabelText('Countries'), { target: { value: 'TH, VN' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText('Local currency'), { target: { value: 'THB' } });
    fireEvent.change(screen.getByLabelText('Budget (local currency)'), {
      target: { value: '90000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add trip budget/i }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bangkok',
        countries: ['TH', 'VN'],
        localCurrency: 'THB',
        budgetLocalCents: 9_000_000,
      }),
    );
  });

  it('shows an assertive validation error and does not submit when invalid', () => {
    const onCreate = vi.fn();
    render(<TripCountryBudgetsSection {...baseProps} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: /add trip budget/i }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/give the trip a name/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('conveys over-budget state with text, not colour alone', () => {
    render(
      <TripCountryBudgetsSection
        {...baseProps}
        views={[
          makeView({
            isOverBudget: true,
            remainingLocalCents: -200_000,
            percentUsed: 120,
          }),
        ]}
      />,
    );

    expect(screen.getByText(/over budget/i)).toBeInTheDocument();
  });

  it('discloses a missing home-currency rate instead of inventing one', () => {
    render(
      <TripCountryBudgetsSection
        {...baseProps}
        views={[
          makeView({
            displayConversionAvailable: false,
            budgetDisplayCents: null,
            displaySpentCents: null,
            remainingDisplayCents: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText(/no usd rate available/i)).toBeInTheDocument();
  });

  it('discloses unconvertible transaction currencies', () => {
    render(
      <TripCountryBudgetsSection
        {...baseProps}
        views={[makeView({ unconvertedCurrencies: ['EUR'] })]}
      />,
    );

    expect(screen.getByText(/excludes spend in eur/i)).toBeInTheDocument();
  });

  it('archives, restores, and deletes via handlers', () => {
    const onArchiveChange = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <TripCountryBudgetsSection
        {...baseProps}
        views={[makeView()]}
        onArchiveChange={onArchiveChange}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /archive bangkok jan–mar/i }));
    expect(onArchiveChange).toHaveBeenCalledWith('trip-thailand', true);

    fireEvent.click(screen.getByRole('button', { name: /delete bangkok jan–mar trip budget/i }));
    expect(onDelete).toHaveBeenCalledWith('trip-thailand');

    rerender(
      <TripCountryBudgetsSection
        {...baseProps}
        views={[makeView({ budget: makeBudget({ archived: true }) })]}
        onArchiveChange={onArchiveChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reopen bangkok jan–mar/i }));
    expect(onArchiveChange).toHaveBeenLastCalledWith('trip-thailand', false);
  });

  it('forwards filter changes', () => {
    const onCountryFilterChange = vi.fn();
    const onShowArchivedChange = vi.fn();
    render(
      <TripCountryBudgetsSection
        {...baseProps}
        onCountryFilterChange={onCountryFilterChange}
        onShowArchivedChange={onShowArchivedChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Filter by country'), { target: { value: 'VN' } });
    expect(onCountryFilterChange).toHaveBeenCalledWith('VN');

    fireEvent.click(screen.getByLabelText('Show archived trips'));
    expect(onShowArchivedChange).toHaveBeenCalledWith(true);
  });

  it('discloses stale / offline exchange rates', () => {
    render(<TripCountryBudgetsSection {...baseProps} ratesStale />);
    expect(screen.getByText(/cached rates that may be stale or offline/i)).toBeInTheDocument();
  });
});
