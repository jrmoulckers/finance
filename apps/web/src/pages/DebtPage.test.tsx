// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the DebtPage component.
 *
 * Follows web testing conventions: mock hooks, test loading/empty/error
 * states, and verify accessible markup.
 *
 * References: issues #1662, #1685, #1690, #1681, #1761, #1569
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import type { Account } from '../kmp/bridge';

const mockUseAccountsState = vi.hoisted(() => ({ accounts: [] as Account[] }));

vi.mock('../hooks/useAccounts', () => ({
  useAccounts: () => ({
    accounts: mockUseAccountsState.accounts,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}));

// Mock common components to avoid provider dependencies
vi.mock('../components/common', () => ({
  CurrencyDisplay: ({ amount, _context }: { amount: number; _context?: string }) => (
    <span data-testid="currency">{amount}</span>
  ),
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  ),
  ErrorBanner: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  LoadingSpinner: () => <div role="status">Loading…</div>,
}));

// We need to import after mocks
import { DebtPage } from './DebtPage';
import {
  calculateStudentLoanDashboardSummary,
  calculateStudentLoanWhatIfScenario,
} from '../lib/debt-student-loan-engine';
import type { StudentLoan } from '../lib/debt-types';

function openStudentLoansTab(): void {
  const tab = screen.getByRole('tab', { name: 'Student Loans' });
  fireEvent.click(tab);
}

function addStudentLoan(fields: {
  name: string;
  servicer: string;
  balance: string;
  originalBalance?: string;
  rate: string;
  minimumPayment: string;
  status?: string;
}): void {
  fireEvent.change(screen.getByLabelText('Loan name'), { target: { value: fields.name } });
  fireEvent.change(screen.getByLabelText('Servicer'), { target: { value: fields.servicer } });
  fireEvent.change(screen.getByLabelText('Current balance ($)'), {
    target: { value: fields.balance },
  });
  fireEvent.change(screen.getByLabelText('Original balance ($)'), {
    target: { value: fields.originalBalance ?? '' },
  });
  fireEvent.change(screen.getByLabelText('Interest rate (%)'), { target: { value: fields.rate } });
  fireEvent.change(screen.getByLabelText('Minimum payment ($)'), {
    target: { value: fields.minimumPayment },
  });
  if (fields.status) {
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: fields.status } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add Student Loan' }));
}

function formatMonthYear(dateIso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateIso}T00:00:00.000Z`));
}

function buildAccount(overrides: Partial<Account>): Account {
  return {
    id: 'account-1',
    householdId: 'household-1',
    name: 'Visa Card',
    type: 'CREDIT_CARD',
    purpose: 'personal',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 400_000 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

describe('DebtPage', () => {
  beforeEach(() => {
    mockUseAccountsState.accounts = [];
    localStorage.clear();
  });
  it('renders the page title', () => {
    render(<DebtPage />);
    expect(screen.getByText('Debt Management')).toBeDefined();
  });

  it('renders all six tabs', () => {
    render(<DebtPage />);
    expect(screen.getByText('Payoff Planner')).toBeDefined();
    expect(screen.getByText('Payoff Rings')).toBeDefined();
    expect(screen.getByText('Joint Debt')).toBeDefined();
    expect(screen.getByText('BNPL Dashboard')).toBeDefined();
    expect(screen.getByText('Student Loans')).toBeDefined();
    expect(screen.getByText('Credit Cards')).toBeDefined();
  });

  it('shows Payoff Planner tab by default', () => {
    render(<DebtPage />);
    const payoffTab = screen.getByRole('tab', { name: 'Payoff Planner' });
    expect(payoffTab.getAttribute('aria-selected')).toBe('true');
  });

  it('shows empty state when no debts exist', () => {
    render(<DebtPage />);
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.getByText('No debts added')).toBeDefined();
  });

  it('imports debt accounts into the payoff planner with countdown, interest saved, milestones, and DTI', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'cc-1',
        name: 'Rewards Credit Card',
        type: 'CREDIT_CARD',
        currentBalance: { amount: -400_000 },
      }),
      buildAccount({
        id: 'loan-1',
        name: 'Personal Loan',
        type: 'LOAN',
        currentBalance: { amount: 800_000 },
      }),
    ];

    render(<DebtPage />);

    expect(screen.getByText('Debt-Free Date')).toBeDefined();
    const countdown = screen.getByRole('region', { name: 'Debt-free countdown' });
    expect(within(countdown).getByText('Interest saved')).toBeDefined();
    expect(screen.getByText('Debt Milestones')).toBeDefined();
    expect(screen.getByText('Debt-to-Income Trend')).toBeDefined();
    expect(screen.getByText('Imported from Accounts')).toBeDefined();
    expect(screen.getAllByText('Rewards Credit Card').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Personal Loan').length).toBeGreaterThan(0);
  });

  it('shows a per-debt payoff timeline with projected dates (#3368)', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'cc-1',
        name: 'Rewards Credit Card',
        type: 'CREDIT_CARD',
        currentBalance: { amount: -400_000 },
      }),
      buildAccount({
        id: 'loan-1',
        name: 'Personal Loan',
        type: 'LOAN',
        currentBalance: { amount: 800_000 },
      }),
    ];

    render(<DebtPage />);

    const timeline = screen.getByRole('region', { name: 'Payoff timeline' });
    expect(within(timeline).getByText('Payoff Timeline')).toBeDefined();
    // Each debt shows as its own dated milestone, in payoff order.
    expect(within(timeline).getByText('Rewards Credit Card')).toBeDefined();
    expect(within(timeline).getByText('Personal Loan')).toBeDefined();
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(2);
  });

  it('warns instead of showing a countdown when the payment never covers interest (#3355)', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'cc-maxed',
        name: 'Maxed Card',
        type: 'CREDIT_CARD',
        currentBalance: { amount: -600_000 },
      }),
    ];

    render(<DebtPage />);

    // With the default 19.99% APR and 3% minimum the card amortizes, so the
    // hero shows the debt-free countdown.
    expect(screen.getByRole('region', { name: 'Debt-free countdown' })).toBeDefined();

    // Push the APR up and the minimum payment below the monthly interest, and
    // remove the default extra payment so nothing covers the shortfall.
    fireEvent.change(screen.getByLabelText('Extra monthly payment ($)'), {
      target: { value: '0' },
    });
    const importRegion = screen.getByRole('region', { name: 'Imported debt accounts' });
    const cardItem = within(importRegion).getByText('Maxed Card').closest('li') as HTMLElement;
    fireEvent.change(within(cardItem).getByLabelText('APR (%)'), { target: { value: '24.99' } });
    fireEvent.change(within(cardItem).getByLabelText('Minimum payment ($)'), {
      target: { value: '100' },
    });

    // The hero now warns that the plan never reaches debt-free instead of
    // rendering a misleading "100 years to debt-free" countdown.
    expect(screen.queryByRole('region', { name: 'Debt-free countdown' })).toBeNull();
    const warning = screen.getByRole('region', { name: 'Payment does not cover interest' });
    expect(within(warning).getByText('This plan never reaches debt-free')).toBeDefined();
    expect(within(warning).getByText('Maxed Card')).toBeDefined();
  });

  it('switches tabs on click', () => {
    render(<DebtPage />);
    const bnplTab = screen.getByRole('tab', { name: 'BNPL Dashboard' });
    fireEvent.click(bnplTab);
    expect(bnplTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('No BNPL obligations')).toBeDefined();
  });

  it('renders Student Loans empty state and add form', () => {
    render(<DebtPage />);
    openStudentLoansTab();
    expect(screen.getByText('No student loans')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Add Student Loan' })).toBeDefined();
  });

  it('builds a student loan dashboard after adding loans', () => {
    render(<DebtPage />);
    openStudentLoansTab();

    addStudentLoan({
      name: 'Federal Direct Loan',
      servicer: 'MOHELA',
      balance: '10000',
      originalBalance: '12000',
      rate: '5',
      minimumPayment: '150',
    });
    addStudentLoan({
      name: 'Parent PLUS Loan',
      servicer: 'Aidvantage',
      balance: '5000',
      originalBalance: '8000',
      rate: '7',
      minimumPayment: '80',
      status: 'forbearance',
    });

    const todayIso = new Date().toISOString().slice(0, 10);
    const loans: StudentLoan[] = [
      {
        id: 'a',
        name: 'Federal Direct Loan',
        servicer: 'MOHELA',
        balanceCents: 1_000_000,
        annualRateBps: 500,
        minimumPaymentCents: 15_000,
        status: 'in_repayment',
        originalBalanceCents: 1_200_000,
        isFederal: true,
        isPslfEligible: false,
        pslfPaymentsMade: 0,
      },
      {
        id: 'b',
        name: 'Parent PLUS Loan',
        servicer: 'Aidvantage',
        balanceCents: 500_000,
        annualRateBps: 700,
        minimumPaymentCents: 8_000,
        status: 'forbearance',
        originalBalanceCents: 800_000,
        isFederal: true,
        isPslfEligible: false,
        pslfPaymentsMade: 0,
      },
    ];
    const summary = calculateStudentLoanDashboardSummary(loans, todayIso);
    const whatIf = calculateStudentLoanWhatIfScenario(loans, 5_000, todayIso);

    expect(screen.getByText('Dashboard Overview')).toBeDefined();
    expect(screen.getByText(String(summary.totalBalanceCents))).toBeDefined();
    expect(screen.getByText(`${(summary.weightedAverageRateBps / 100).toFixed(2)}%`)).toBeDefined();
    expect(screen.getByText(String(summary.monthlyPaymentCents))).toBeDefined();
    expect(screen.getByText(formatMonthYear(summary.estimatedPayoffDate!))).toBeDefined();
    expect(screen.getByText(String(summary.totalInterestCents))).toBeDefined();
    expect(screen.getByText('MOHELA')).toBeDefined();
    expect(screen.getByText('Aidvantage')).toBeDefined();
    expect(screen.getAllByText('In Repayment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Forbearance').length).toBeGreaterThan(0);

    const progress = screen.getByRole('progressbar', { name: 'Student loans paid off' });
    expect(progress.getAttribute('aria-valuenow')).toBe(String(summary.percentPaidOff));

    fireEvent.change(screen.getByLabelText('Extra payment each month ($)'), {
      target: { value: '50' },
    });
    const whatIfText = screen
      .getByText(
        (_, element) => element?.classList.contains('student-loan-what-if__result') ?? false,
      )
      .textContent?.replace(/\s+/g, ' ')
      .trim();
    expect(whatIfText).toContain(
      `Pay 5000 extra/month → save ${whatIf.interestSavedCents} in interest and pay off ${whatIf.monthsSaved} months earlier.`,
    );
  });

  it('shows editable student loan scenario comparisons', () => {
    render(<DebtPage />);
    openStudentLoansTab();

    addStudentLoan({
      name: 'Federal Direct Loan',
      servicer: 'MOHELA',
      balance: '10000',
      originalBalance: '12000',
      rate: '5',
      minimumPayment: '150',
    });

    expect(screen.getByText('Editable Scenario Comparison')).toBeDefined();
    expect(screen.getByText('IDR (PAYE)')).toBeDefined();
    expect(screen.getByText('PSLF path')).toBeDefined();
    expect(screen.getByText('Refinance')).toBeDefined();
    expect(screen.getByText('Salary raise')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Refinance APR (%)'), { target: { value: '3.5' } });
    expect(screen.getByDisplayValue('3.5')).toBeDefined();
  });

  it('edits an existing student loan', () => {
    render(<DebtPage />);
    openStudentLoansTab();

    addStudentLoan({
      name: 'Federal Direct Loan',
      servicer: 'MOHELA',
      balance: '10000',
      originalBalance: '12000',
      rate: '5',
      minimumPayment: '150',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit Loan' }));
    fireEvent.change(screen.getByLabelText('Servicer'), { target: { value: 'Nelnet' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'deferred' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Student Loan' }));

    expect(screen.getByText('Nelnet')).toBeDefined();
    expect(screen.getAllByText('Deferred').length).toBeGreaterThan(0);
  });

  it('renders Credit Cards empty state', () => {
    render(<DebtPage />);
    const tab = screen.getByRole('tab', { name: 'Credit Cards' });
    fireEvent.click(tab);
    expect(screen.getByText('No credit cards')).toBeDefined();
  });

  it('shows the Joint Debt empty state when no debts exist', () => {
    render(<DebtPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Joint Debt' }));
    expect(screen.getByText('No debts to plan together')).toBeDefined();
  });

  it('builds a joint payoff comparison from both partners debts', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'cc-joint',
        name: 'Rewards Card',
        type: 'CREDIT_CARD',
        currentBalance: { amount: -300_000 },
      }),
      buildAccount({
        id: 'loan-joint',
        name: 'Car Loan',
        type: 'LOAN',
        currentBalance: { amount: -100_000 },
      }),
    ];
    render(<DebtPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Joint Debt' }));

    expect(screen.getByRole('heading', { name: 'Joint Debt Payoff' })).toBeDefined();
    // Comparison table is present with both strategies as column headers.
    expect(screen.getByRole('columnheader', { name: /Avalanche/ })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /Snowball/ })).toBeDefined();
    // Ownership selection appears for each debt.
    expect(screen.getByLabelText('Owner of Rewards Card')).toBeDefined();
    expect(screen.getByLabelText('Treatment of Car Loan')).toBeDefined();
    // Recommendation announces via a live region.
    const status = screen.getByRole('status');
    expect(status.textContent).toBeTruthy();
  });

  it('has proper ARIA tab structure', () => {
    render(<DebtPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(6);

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toBeDefined();
  });

  it('shows the payoff rings surface with payoff date and milestones', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'auto-1',
        name: 'Auto Loan',
        type: 'LOAN',
        currentBalance: { amount: -620_000 },
      }),
    ];
    render(<DebtPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Payoff Rings' }));

    expect(screen.getByText('Payoff Rings', { selector: 'h2' })).toBeDefined();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Auto Loan');
    expect(screen.getByText('Estimated payoff date')).toBeDefined();
    expect(screen.getByText('Milestones')).toBeDefined();
    expect(screen.getByLabelText('Extra monthly payment ($)')).toBeDefined();
  });

  it('tab panel is labeled by its tab', () => {
    render(<DebtPage />);
    const tabpanel = screen.getByRole('tabpanel');
    const labelledBy = tabpanel.getAttribute('aria-labelledby');
    expect(labelledBy).toBe('debt-tab-payoff');
  });

  it('moves between tabs with arrow keys using roving tabindex (#3362)', () => {
    render(<DebtPage />);
    const payoffTab = screen.getByRole('tab', { name: 'Payoff Planner' });
    const ringsTab = screen.getByRole('tab', { name: 'Payoff Rings' });
    const creditTab = screen.getByRole('tab', { name: 'Credit Cards' });

    // Roving tabindex: only the active tab is in the tab order.
    expect(payoffTab.getAttribute('tabindex')).toBe('0');
    expect(ringsTab.getAttribute('tabindex')).toBe('-1');

    // ArrowRight moves focus + selection to the next tab (automatic activation).
    fireEvent.keyDown(payoffTab, { key: 'ArrowRight' });
    expect(ringsTab.getAttribute('aria-selected')).toBe('true');
    expect(ringsTab.getAttribute('tabindex')).toBe('0');
    expect(payoffTab.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(ringsTab);

    // Home jumps to the first tab.
    fireEvent.keyDown(ringsTab, { key: 'Home' });
    expect(payoffTab.getAttribute('aria-selected')).toBe('true');

    // ArrowLeft from the first tab wraps to the last.
    fireEvent.keyDown(payoffTab, { key: 'ArrowLeft' });
    expect(creditTab.getAttribute('aria-selected')).toBe('true');

    // End jumps to the last tab.
    fireEvent.keyDown(payoffTab, { key: 'End' });
    expect(creditTab.getAttribute('aria-selected')).toBe('true');
    expect(creditTab.getAttribute('tabindex')).toBe('0');
  });

  it('focuses the manual debt name field when the empty-state CTA is activated (#3360)', () => {
    render(<DebtPage />);
    const emptyState = screen.getByTestId('empty-state');
    const addButton = within(emptyState).getByRole('button', { name: 'Add Debt' });
    fireEvent.click(addButton);
    expect(document.activeElement).toBe(screen.getByLabelText('Debt name'));
  });

  it('surfaces manual-entry validation errors instead of failing silently (#3361)', () => {
    const { container } = render(<DebtPage />);
    const form = container.querySelector('form.debt-entry-form') as HTMLFormElement;
    fireEvent.submit(form);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Enter a name for this debt.');

    const nameInput = screen.getByLabelText('Debt name');
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(nameInput);

    // Empty state is still shown because no valid debt was added.
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('adds a manual debt and clears the error summary when the form is valid (#3361)', () => {
    const { container } = render(<DebtPage />);
    fireEvent.change(screen.getByLabelText('Debt name'), { target: { value: 'Visa' } });
    fireEvent.change(screen.getByLabelText('Debt balance ($)'), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText('Minimum payment ($)'), { target: { value: '50' } });

    const form = container.querySelector('form.debt-entry-form') as HTMLFormElement;
    fireEvent.submit(form);

    // Adding a valid debt replaces the empty state with payoff results.
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(screen.queryByText(/Please fix the following/)).toBeNull();
  });

  it('marks imported APR and minimum as estimated until confirmed (#3358)', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'auto-est',
        name: 'Car Loan',
        type: 'LOAN',
        currentBalance: { amount: -900_000 },
      }),
    ];
    render(<DebtPage />);
    const importRegion = screen.getByRole('region', { name: 'Imported debt accounts' });
    const item = within(importRegion).getByText('Car Loan').closest('li') as HTMLElement;

    expect(within(item).getByText(/Estimated APR/)).toBeDefined();
    expect(within(item).getByText(/Estimated minimum payment/)).toBeDefined();

    // Confirming the APR clears its "estimated" hint.
    fireEvent.change(within(item).getByLabelText('APR (%)'), { target: { value: '6.5' } });
    expect(within(item).queryByText(/Estimated APR/)).toBeNull();
  });

  it('prompts for a starting balance instead of showing 0% progress on imported debts (#3356)', () => {
    mockUseAccountsState.accounts = [
      buildAccount({
        id: 'cc-fresh',
        name: 'Store Card',
        type: 'CREDIT_CARD',
        currentBalance: { amount: -50_000 },
      }),
    ];
    render(<DebtPage />);

    // Imported debts default their original balance to the current balance, so
    // no real payoff progress exists yet — guide rather than demoralize with 0%.
    expect(screen.getByText(/setting each debt.*starting balance/i)).toBeDefined();
    expect(screen.queryByText('0.0% paid off. Every payment is progress.')).toBeNull();
  });

  it('persists manually-entered debts across a reload (#3357)', () => {
    const { unmount } = render(<DebtPage />);
    fireEvent.change(screen.getByLabelText('Debt name'), { target: { value: 'Marcus Visa' } });
    fireEvent.change(screen.getByLabelText('Debt balance ($)'), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText('Minimum payment ($)'), { target: { value: '45' } });
    fireEvent.submit(document.querySelector('form.debt-entry-form') as HTMLFormElement);

    // The debt is registered (empty state replaced) and written to storage.
    expect(screen.queryByTestId('empty-state')).toBeNull();
    expect(localStorage.getItem('finance.debt.tracker.v1')).toContain('Marcus Visa');

    // Simulate a page reload: a fresh mount must rehydrate from localStorage.
    unmount();
    render(<DebtPage />);
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });
});
