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
  });
  it('renders the page title', () => {
    render(<DebtPage />);
    expect(screen.getByText('Debt Management')).toBeDefined();
  });

  it('renders all five tabs', () => {
    render(<DebtPage />);
    expect(screen.getByText('Payoff Planner')).toBeDefined();
    expect(screen.getByText('Payoff Rings')).toBeDefined();
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

  it('has proper ARIA tab structure', () => {
    render(<DebtPage />);
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);

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
});
