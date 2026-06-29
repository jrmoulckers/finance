// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  useAccounts,
  useBills,
  useBudgets,
  useCategories,
  useCoachAlerts,
  useDashboardData,
  useGoals,
  usePredictiveBalance,
  useRetirementPlanner,
  useRmdTracking,
  useSpendingPace,
  useTransactions,
} from '../hooks';
import { PrivacyModeProvider } from '../contexts/PrivacyModeContext';
import { calculateSafeToSpend } from '../lib/dashboard/safe-to-spend';
import { evaluatePrivacyScreenCoverage } from '../lib/security/privacy-screen';
import { auditPrivacySurfaceCoverage, privacySurface } from '../lib/security/privacy-coverage';
import { DashboardPage } from './DashboardPage';

const dashboardCss = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.css'), 'utf8');

vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
  useBills: vi.fn(),
  useBudgets: vi.fn(),
  useDashboardData: vi.fn(),
  useCategories: vi.fn(),
  useGoals: vi.fn(),
  usePredictiveBalance: vi.fn(),
  useRetirementPlanner: vi.fn(),
  useRmdTracking: vi.fn(),
  useSpendingPace: vi.fn(),
  useCoachAlerts: vi.fn(),
  useTransactions: vi.fn(),
  useSyncStatus: vi.fn(() => ({
    isOffline: false,
    isSyncing: false,
    pendingMutations: 0,
    lastSyncTime: null,
    syncNow: vi.fn(),
    authError: false,
    conflictCount: 0,
  })),
}));

vi.mock('../components/ai/QueryEngine', () => ({
  QueryEngine: () => <div data-testid="ai-query-engine">AI query engine</div>,
  default: () => <div data-testid="ai-query-engine">AI query engine</div>,
}));

vi.mock('../components/coaching', () => ({
  CoachCard: () => <section aria-label="Financial coach">What needs attention now</section>,
  CoachPanel: () => <section aria-label="Coach insights">Coach insights</section>,
}));

vi.mock('../components/common/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <section>{title}</section>,
}));
vi.mock('../components/common/ErrorBanner', () => ({
  ErrorBanner: ({ message }: { message: string }) => <section>{message}</section>,
}));
vi.mock('../components/common/LoadingSpinner', () => ({
  LoadingSpinner: ({ label }: { label?: string }) => (
    <div role="status" aria-label={label ?? 'Loading'}>
      {label ?? 'Loading'}
    </div>
  ),
}));
vi.mock('../components/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

// Chart components depend on Recharts canvas APIs unavailable in jsdom.
// Stub them so the render test stays provider/canvas-free.
vi.mock('../components/charts', () => ({
  SpendingTrendChart: () => null,
  SpendingBarChart: () => null,
  CategoryPieChart: () => null,
}));
vi.mock('../components/charts/SpendingTrendChart', () => ({
  SpendingTrendChart: () => null,
}));
vi.mock('../components/charts/SpendingBarChart', () => ({
  SpendingBarChart: () => null,
}));
vi.mock('../components/charts/CategoryPieChart', () => ({
  CategoryPieChart: () => null,
}));

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseBills = vi.mocked(useBills);
const mockedUseBudgets = vi.mocked(useBudgets);
const mockedUseDashboardData = vi.mocked(useDashboardData);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseGoals = vi.mocked(useGoals);
const mockedUsePredictiveBalance = vi.mocked(usePredictiveBalance);
const mockedUseRetirementPlanner = vi.mocked(useRetirementPlanner);
const mockedUseRmdTracking = vi.mocked(useRmdTracking);
const mockedUseSpendingPace = vi.mocked(useSpendingPace);
const mockedUseCoachAlerts = vi.mocked(useCoachAlerts);
const mockedUseTransactions = vi.mocked(useTransactions);
const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function currentMonthDate(day = 15): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

describe('calculateSafeToSpend', () => {
  it('subtracts bills, planned savings, and discretionary spending from expected income', () => {
    expect(
      calculateSafeToSpend({
        expectedMonthlyIncomeCents: 250000,
        remainingBillsCents: 90000,
        plannedSavingsCents: 30000,
        discretionarySpentCents: 66000,
      }).safeToSpendCents,
    ).toBe(64000);
  });

  it('normalizes invalid negative inputs without inflating safe-to-spend', () => {
    expect(
      calculateSafeToSpend({
        expectedMonthlyIncomeCents: Number.NaN,
        remainingBillsCents: -5000,
        plannedSavingsCents: 10000,
        discretionarySpentCents: 12345.9,
      }),
    ).toMatchObject({
      expectedMonthlyIncomeCents: 0,
      remainingBillsCents: 0,
      plannedSavingsCents: 10000,
      discretionarySpentCents: 12345,
      safeToSpendCents: -22345,
    });
  });
});

describe('DashboardPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedUseRetirementPlanner.mockReturnValue({
      params: { currentAge: 45 },
      readiness: null,
      incomeProjection: { yearlyIncome: [], totalProjectedIncomeCents: 0 },
      computing: false,
      setCurrentAge: vi.fn(),
      setRetirementAge: vi.fn(),
      setPlanningHorizonAge: vi.fn(),
      setMonthlyContribution: vi.fn(),
      setDesiredSpending: vi.fn(),
      setRetirementIncome: vi.fn(),
      setAnnualReturn: vi.fn(),
      setInflationRate: vi.fn(),
      simulateAtSpending: vi.fn(),
      resetToDefaults: vi.fn(),
    } as unknown as ReturnType<typeof useRetirementPlanner>);
    mockedUseRmdTracking.mockReturnValue({
      statuses: [],
      reminders: [],
      dueCount: 0,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Personal Checking',
          type: 'CHECKING',
          purpose: 'personal',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 2475000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
        {
          id: 'account-2',
          householdId: 'household-1',
          name: 'Business Checking',
          type: 'CHECKING',
          purpose: 'business',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 1250000 },
          isArchived: false,
          sortOrder: 2,
          icon: 'bank',
          color: '#059669',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    });
    mockedUseDashboardData.mockReturnValue({
      data: {
        netWorth: 3725000,
        spentThisMonth: 240792,
        incomeThisMonth: 450000,
        monthlyBudget: 350000,
        budgetSpent: 234050,
        recentTransactions: [
          {
            id: '1',
            householdId: 'household-1',
            accountId: 'account-1',
            categoryId: 'category-food',
            type: 'EXPENSE',
            status: 'CLEARED',
            amount: { amount: 6742 },
            currency: { code: 'USD', decimalPlaces: 2 },
            payee: 'Grocery Store',
            note: null,
            date: '2025-03-06',
            transferAccountId: null,
            transferTransactionId: null,
            isRecurring: false,
            recurringRuleId: null,
            tags: [],
            merchantAddress: null,
            merchantCity: null,
            merchantState: null,
            merchantZip: null,
            merchantCountry: null,
            externalReferenceId: null,
            statementDescription: null,
            customFields: null,
            extraNotes: null,
            counterpartyName: null,
            counterpartyAccountId: null,
            ...syncMetadata,
          },
          {
            id: '2',
            householdId: 'household-1',
            accountId: 'account-2',
            categoryId: 'category-income',
            type: 'INCOME',
            status: 'CLEARED',
            amount: { amount: 450000 },
            currency: { code: 'USD', decimalPlaces: 2 },
            payee: 'Client Retainer',
            note: null,
            date: '2025-03-06',
            transferAccountId: null,
            transferTransactionId: null,
            isRecurring: false,
            recurringRuleId: null,
            tags: [],
            merchantAddress: null,
            merchantCity: null,
            merchantState: null,
            merchantZip: null,
            merchantCountry: null,
            externalReferenceId: null,
            statementDescription: null,
            customFields: null,
            extraNotes: null,
            counterpartyName: null,
            counterpartyAccountId: null,
            ...syncMetadata,
          },
        ],
        accountSummary: [{ type: 'CHECKING', total: 3725000 }],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockedUseCoachAlerts.mockReturnValue({
      analysis: {
        velocities: [],
        cashFlow: {
          currentBalanceCents: 2475000,
          projectedRecurringIncomeCents: 450000,
          projectedRecurringExpenseCents: 90000,
          projectedDiscretionaryExpenseCents: 125000,
          projectedEndBalanceCents: 2710000,
          daysRemaining: 10,
          willOverdraft: false,
          balanceSnapshots: [],
          recurringItems: [],
        },
        anomalies: [],
        alerts: [
          {
            id: 'alert:budget:food',
            severity: 'warning',
            type: 'budget-velocity',
            title: 'Food is ahead of budget pace',
            message: 'Food is tracking above the monthly plan.',
            actionLabel: 'Review budgets',
            actionRoute: '/budgets',
            sortValue: 100,
          },
        ],
        suggestions: [
          {
            id: 'suggestion:food',
            severity: 'warning',
            title: 'Slow Food spending pace',
            description: 'Trim daily Food spending for the rest of the month.',
            actionLabel: 'Review budgets',
            actionRoute: '/budgets',
          },
        ],
      },
      alerts: [
        {
          id: 'alert:budget:food',
          severity: 'warning',
          type: 'budget-velocity',
          title: 'Food is ahead of budget pace',
          message: 'Food is tracking above the monthly plan.',
          actionLabel: 'Review budgets',
          actionRoute: '/budgets',
          sortValue: 100,
        },
      ],
      topAlerts: [
        {
          id: 'alert:budget:food',
          severity: 'warning',
          type: 'budget-velocity',
          title: 'Food is ahead of budget pace',
          message: 'Food is tracking above the monthly plan.',
          actionLabel: 'Review budgets',
          actionRoute: '/budgets',
          sortValue: 100,
        },
      ],
      loading: false,
      error: null,
      dismissAlert: vi.fn(),
      clearDismissedAlerts: vi.fn(),
      dismissedAlertIds: new Set(),
    });
    mockedUseCategories.mockReturnValue({
      categories: [
        {
          id: 'category-food',
          householdId: 'household-1',
          name: 'Food',
          icon: 'utensils',
          color: '#16A34A',
          parentId: null,
          isIncome: false,
          isSystem: false,
          sortOrder: 1,
          ...syncMetadata,
        },
        {
          id: 'category-income',
          householdId: 'household-1',
          name: 'Income',
          icon: 'wallet',
          color: '#059669',
          parentId: null,
          isIncome: true,
          isSystem: true,
          sortOrder: 2,
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
      foodMealTemplate: {
        parentCategory: null,
        subcategories: [],
        missingSubcategoryDefinitions: [],
      },
      ensureFoodMealCategories: vi.fn(),
    });
    mockedUseBills.mockReturnValue({
      bills: [
        {
          id: 'bill-rent',
          householdId: 'household-1',
          name: 'Rent',
          payee: 'Apartment',
          amount: { amount: 80000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          dueDate: currentMonthDate(20),
          frequency: 'MONTHLY',
          status: 'UPCOMING',
          categoryId: null,
          accountId: 'account-1',
          note: null,
          isAutoPay: false,
          reminderDaysBefore: 3,
          lastPaidDate: null,
          ...syncMetadata,
        },
      ],
      summary: { upcomingCount: 1, overdueCount: 0, totalUpcoming: 80000, totalOverdue: 0 },
      loading: false,
      error: null,
      notificationPermission: 'unsupported',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn(),
    });
    mockedUseBudgets.mockReturnValue({
      budgets: [
        {
          id: 'budget-food',
          householdId: 'household-1',
          categoryId: 'category-food',
          name: 'Groceries',
          amount: { amount: 60000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          period: 'MONTHLY',
          startDate: currentMonthDate(1),
          endDate: null,
          isRollover: false,
          spentAmount: { amount: 20000 },
          remainingAmount: { amount: 40000 },
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createBudget: vi.fn(),
      createBudgetTemplate: vi.fn(),
      updateBudget: vi.fn(),
      deleteBudget: vi.fn(),
      reorderBudgets: vi.fn(),
      getBudgetSpendingBreakdown: vi.fn(),
    });
    mockedUseGoals.mockReturnValue({
      goals: [
        {
          id: 'goal-emergency',
          householdId: 'household-1',
          name: 'Emergency fund',
          description: null,
          targetAmount: { amount: 50000 },
          currentAmount: { amount: 20000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          targetDate: currentMonthDate(25),
          status: 'ACTIVE',
          icon: null,
          color: null,
          accountId: 'account-1',
          ...syncMetadata,
        },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createGoal: vi.fn(),
      updateGoal: vi.fn(),
      contributeToGoal: vi.fn(),
      deleteGoal: vi.fn(),
      reorderGoals: vi.fn(),
    });
    mockedUsePredictiveBalance.mockReturnValue({
      prediction: {
        accounts: [
          {
            accountId: 'account-1',
            accountName: 'Personal Checking',
            currentBalanceCents: 2475000,
            predictedBalanceCents: 2475000,
            projectedSpendingCents: 0,
            projectedIncomeCents: 0,
            avgDailySpendingCents: 0,
            avgDailyIncomeCents: 0,
            daysRemaining: 10,
            confidence: 0.8,
            trend: 'flat',
          },
        ],
        totalPredictedBalanceCents: 2475000,
        totalCurrentBalanceCents: 2475000,
        predictedChangeCents: 0,
        generatedAt: '2025-01-01T00:00:00Z',
        endOfMonth: currentMonthDate(28),
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    mockedUseSpendingPace.mockReturnValue({
      paces: [
        {
          budgetId: 'budget-food',
          budgetName: 'Groceries',
          budgetAmountCents: 60000,
          spentCents: 20000,
          remainingCents: 40000,
          totalDays: 30,
          elapsedDays: 10,
          remainingDays: 20,
          expectedDailyPaceCents: 2000,
          actualDailyPaceCents: 2000,
          isAheadOfPace: false,
          predictedTotalCents: 60000,
          willOverspend: false,
          daysUntilExhausted: null,
          percentUsed: 33,
          percentTimeElapsed: 33,
        },
      ],
      overspending: [],
      onTrack: [],
    });
    mockedUseTransactions.mockImplementation((filters) => ({
      transactions:
        filters && 'type' in filters
          ? []
          : [
              {
                id: 'month-1',
                householdId: 'household-1',
                accountId: 'account-1',
                categoryId: 'category-food',
                type: 'EXPENSE',
                status: 'CLEARED',
                amount: { amount: 6742 },
                currency: { code: 'USD', decimalPlaces: 2 },
                payee: 'Grocery Store',
                note: null,
                date: '2025-03-06',
                transferAccountId: null,
                transferTransactionId: null,
                isRecurring: false,
                recurringRuleId: null,
                tags: [],
                merchantAddress: null,
                merchantCity: null,
                merchantState: null,
                merchantZip: null,
                merchantCountry: null,
                externalReferenceId: null,
                statementDescription: null,
                customFields: null,
                extraNotes: null,
                counterpartyName: null,
                counterpartyAccountId: null,
                ...syncMetadata,
              },
              {
                id: 'month-2',
                householdId: 'household-1',
                accountId: 'account-2',
                categoryId: 'category-income',
                type: 'INCOME',
                status: 'CLEARED',
                amount: { amount: 450000 },
                currency: { code: 'USD', decimalPlaces: 2 },
                payee: 'Client Retainer',
                note: null,
                date: '2025-03-06',
                transferAccountId: null,
                transferTransactionId: null,
                isRecurring: false,
                recurringRuleId: null,
                tags: [],
                merchantAddress: null,
                merchantCity: null,
                merchantState: null,
                merchantZip: null,
                merchantCountry: null,
                externalReferenceId: null,
                statementDescription: null,
                customFields: null,
                extraNotes: null,
                counterpartyName: null,
                counterpartyAccountId: null,
                ...syncMetadata,
              },
            ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    }));
  });

  it('renders without crashing', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(await screen.findByTestId('ai-query-engine')).toBeInTheDocument();
  });

  it('displays financial summary cards', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Net Worth')).toBeInTheDocument();
    expect(screen.getByText('Spent This Month')).toBeInTheDocument();
    expect(screen.getByText('Budget Health')).toBeInTheDocument();
    expect(await screen.findByText('What needs attention now')).toBeInTheDocument();
  });

  it('renders a safe-to-spend card with a plain-language explanation and breakdown', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const card = await screen.findByLabelText('Safe to spend this month');
    expect(within(card).getByText('Safe to Spend This Month')).toBeInTheDocument();
    expect(
      within(card).getByText(
        'You can still spend about $3,200 this month after bills and savings.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: /show simple breakdown/i }));

    expect(within(card).getByText('Income')).toBeInTheDocument();
    expect(within(card).getByText('Bills left')).toBeInTheDocument();
    expect(within(card).getByText('Savings to set aside')).toBeInTheDocument();
    expect(within(card).getByText('Already spent')).toBeInTheDocument();
  });

  it('renders a prominent savings rate card with percentage, trend, and status', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const card = await screen.findByLabelText('Savings rate this month');
    // Income $4,500 vs $67.42 spend → ~98.5% savings rate this month.
    expect(within(card).getByText('98.5%')).toBeInTheDocument();
    // Prior month mirrors current month in the mock → flat trend.
    expect(within(card).getByText('Flat vs last month')).toBeInTheDocument();
    expect(within(card).getByText('Strong — at or above the 20% target')).toBeInTheDocument();
  });

  it('displays recent transactions section', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Client Retainer')).toBeInTheDocument();
  });

  it('filters dashboard transactions by account purpose', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '💼 Business' }));

    expect(screen.queryByText('Grocery Store')).not.toBeInTheDocument();
    expect(screen.getByText('Client Retainer')).toBeInTheDocument();
  });

  it('surfaces an RMD reminder badge when a distribution is due', () => {
    mockedUseRmdTracking.mockReturnValue({
      statuses: [
        {
          accountId: 'ira-1',
          accountName: 'Traditional IRA',
          priorYearEndBalanceCents: 100000000,
          distributionPeriod: 26.5,
          requiredCents: 3773585,
          withdrawnCents: 0,
          remainingCents: 3773585,
          deadline: '2025-12-31',
          daysUntilDeadline: 20,
          isFirstYear: false,
          isSatisfied: false,
          urgency: 'due-soon',
        },
      ],
      reminders: [
        {
          accountId: 'ira-1',
          accountName: 'Traditional IRA',
          priorYearEndBalanceCents: 100000000,
          distributionPeriod: 26.5,
          requiredCents: 3773585,
          withdrawnCents: 0,
          remainingCents: 3773585,
          deadline: '2025-12-31',
          daysUntilDeadline: 20,
          isFirstYear: false,
          isSatisfied: false,
          urgency: 'due-soon',
        },
      ],
      dueCount: 1,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: /required minimum distribution/i }),
    ).toBeInTheDocument();
  });

  it('has accessible landmarks', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: /financial summary/i })).toBeInTheDocument();
    // The mood journal is a lazily-loaded landmark; `findByRole` re-scans the
    // dashboard accessibility tree on every poll. Allow extra time so the
    // dynamic import can resolve and the role query settle, even when the full
    // test suite runs in parallel and CPU is contended.
    expect(
      await screen.findByRole('region', { name: /mood and spending journal/i }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /recent transactions/i })).toBeInTheDocument();
  });

  it('marks the financial summary grid for compact-width reflow (#2190)', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    const summary = screen.getByRole('region', { name: /financial summary/i });
    const grid = summary.querySelector('.dashboard-summary-grid');
    expect(grid).not.toBeNull();
    expect(grid).toHaveClass('card-grid');
  });

  it('graduates the summary columns from stacked to two-up at compact width (#2190)', () => {
    // iPhone SE (~<=375px): single stacked column.
    const compactBlock = dashboardCss.slice(dashboardCss.indexOf('@media (max-width: 375px)'));
    expect(compactBlock).toMatch(
      /\.card-grid\.dashboard-summary-grid\s*\{[^}]*grid-template-columns:\s*1fr/,
    );
    // Larger phones / portrait tablets: two readable columns.
    expect(dashboardCss).toMatch(/@media\s*\(min-width:\s*376px\)\s*and\s*\(max-width:\s*767px\)/);
    // Cards may shrink below intrinsic width so currency strings never overflow.
    expect(dashboardCss).toMatch(/\.dashboard-summary-grid\s*>\s*\.card\s*\{[^}]*min-width:\s*0/);
  });

  it('covers dashboard financial values when privacy screen is active and reveals them when inactive', async () => {
    const renderDashboard = (initialValue: boolean) =>
      render(
        <PrivacyModeProvider initialValue={initialValue}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </PrivacyModeProvider>,
      );

    const active = renderDashboard(true);
    // The safe-to-spend card is lazily code-split; wait for it before reading
    // the rendered text so the privacy-masking assertion is meaningful.
    await screen.findByLabelText('Safe to spend this month');
    const activeText = document.body.textContent ?? '';
    const screenCoverage = evaluatePrivacyScreenCoverage([
      {
        id: 'dashboard.net-worth',
        categories: ['net-worth'],
        masked: !activeText.includes('$37,250.00'),
      },
      { id: 'dashboard.spending', categories: ['amount'], masked: !activeText.includes('$67.42') },
      {
        id: 'dashboard.safe-to-spend-copy',
        categories: ['amount'],
        masked: !activeText.includes('$3,200'),
      },
      {
        id: 'dashboard.recent-transactions',
        categories: ['amount'],
        masked: !activeText.includes('$67.42') && !activeText.includes('$4,500.00'),
      },
    ]);
    const manifestCoverage = auditPrivacySurfaceCoverage(
      [
        privacySurface('dashboard-balances', 'dashboard', ['balance', 'net-worth'], 'masked'),
        privacySurface('dashboard-transactions', 'detail', ['amount'], 'masked'),
      ],
      ['dashboard', 'detail'],
    );

    expect(screenCoverage.safe).toBe(true);
    expect(manifestCoverage.complete).toBe(true);
    expect(screen.getAllByLabelText('Amount hidden').length).toBeGreaterThan(0);

    active.unmount();
    window.localStorage.clear();

    renderDashboard(false);
    await screen.findByLabelText('Safe to spend this month');
    expect(document.body).toHaveTextContent('$37,250.00');
    expect(document.body).toHaveTextContent('$67.42');
    expect(document.body).toHaveTextContent('$3,200');
    expect(document.body).toHaveTextContent('-$67.42');
  });

  it('renders the mood journal section', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Emotional Spending Journal')).toBeInTheDocument();
    expect(await screen.findByText('Quick mood check-in')).toBeInTheDocument();
    expect(screen.getByText('Journal feed')).toBeInTheDocument();
  });

  it('includes the AI query engine entry point', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('ai-query-engine')).toBeInTheDocument();
  });
});
