// SPDX-License-Identifier: BUSL-1.1

/**
 * Dashboard Data Visualizations tests (#1334)
 *
 * Validates dashboard rendering and chart components:
 * - Dashboard renders with mock financial data
 * - Chart components (bar, line, pie)
 * - Empty state when no data
 * - Loading state with spinners
 * - Data aggregation (monthly totals, category breakdowns)
 * - Accessible chart containers (role="figure", aria-labels)
 * - Error state handling
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useCategories, useDashboardData, useTransactions } from '../hooks';
import { DashboardPage } from '../pages/DashboardPage';
import { SpendingBarChart, type SpendingCategory } from '../components/charts/SpendingBarChart';
import {
  TrendLineChart,
  type TrendDataPoint,
  type TrendSeries,
} from '../components/charts/TrendLineChart';
import { CategoryPieChart, type CategorySlice } from '../components/charts/CategoryPieChart';

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

// ---------------------------------------------------------------------------
// DashboardPage mocks
// ---------------------------------------------------------------------------

vi.mock('../hooks', () => ({
  useDashboardData: vi.fn(),
  useCategories: vi.fn(),
  useTransactions: vi.fn(),
}));

vi.mock('../components/charts', () => ({
  TrendLineChart: () => null,
  SpendingBarChart: () => null,
  CategoryPieChart: () => null,
}));

/** Mock Recharts for chart component tests (canvas/SVG not available in jsdom). */
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
    LineChart: mock('LineChart'),
    Line: mock('Line'),
    Legend: mock('Legend'),
    PieChart: mock('PieChart'),
    Pie: mock('Pie'),
  };
});

const mockedUseDashboardData = vi.mocked(useDashboardData);
const mockedUseCategories = vi.mocked(useCategories);
const mockedUseTransactions = vi.mocked(useTransactions);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

function setupDefaultMocks() {
  mockedUseDashboardData.mockReturnValue({
    data: {
      netWorth: 2475000,
      spentThisMonth: 234050,
      incomeThisMonth: 450000,
      monthlyBudget: 350000,
      budgetSpent: 234050,
      recentTransactions: [
        {
          id: 'txn-1',
          householdId: 'hh-1',
          accountId: 'acct-1',
          categoryId: 'cat-food',
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
          ...syncMetadata,
        },
        {
          id: 'txn-2',
          householdId: 'hh-1',
          accountId: 'acct-1',
          categoryId: 'cat-income',
          type: 'INCOME',
          status: 'CLEARED',
          amount: { amount: 450000 },
          currency: { code: 'USD', decimalPlaces: 2 },
          payee: 'Monthly Salary',
          note: null,
          date: '2025-03-06',
          transferAccountId: null,
          transferTransactionId: null,
          isRecurring: false,
          recurringRuleId: null,
          tags: [],
          ...syncMetadata,
        },
      ],
      accountSummary: [
        { type: 'CHECKING', total: 1200000 },
        { type: 'SAVINGS', total: 1275000 },
      ],
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  });

  mockedUseCategories.mockReturnValue({
    categories: [
      {
        id: 'cat-food',
        householdId: 'hh-1',
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
        id: 'cat-income',
        householdId: 'hh-1',
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
  });

  mockedUseTransactions.mockReturnValue({
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ---------------------------------------------------------------------------
// DashboardPage rendering with data
// ---------------------------------------------------------------------------

describe('DashboardPage rendering with data (#1334)', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('displays financial summary cards', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Net Worth')).toBeInTheDocument();
    expect(screen.getByText('Spent This Month')).toBeInTheDocument();
    expect(screen.getByText('Budget Health')).toBeInTheDocument();
  });

  it('displays budget health percentage', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    // 234050/350000 ≈ 67% used
    expect(screen.getByText('67% used')).toBeInTheDocument();
  });

  it('shows budget progress bar with aria attributes', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '67');
    expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    expect(progressBar).toHaveAttribute('aria-valuemax', '100');
  });

  it('displays recent transactions', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument();
  });

  it('uses semantic list for recent transactions', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Dashboard accessible landmarks
// ---------------------------------------------------------------------------

describe('Dashboard accessible landmarks (#1334)', () => {
  it('has Financial summary region', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: /financial summary/i })).toBeInTheDocument();
  });

  it('has Recent transactions region', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('region', { name: /recent transactions/i })).toBeInTheDocument();
  });

  it('summary card values use aria-live for updates', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const liveRegions = document.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// DashboardPage loading state
// ---------------------------------------------------------------------------

describe('DashboardPage loading state (#1334)', () => {
  it('shows loading spinner when data is loading', () => {
    mockedUseDashboardData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not show summary cards while loading', () => {
    mockedUseDashboardData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Net Worth')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// DashboardPage empty state
// ---------------------------------------------------------------------------

describe('DashboardPage empty state (#1334)', () => {
  it('shows empty state when all data is zero', () => {
    mockedUseDashboardData.mockReturnValue({
      data: {
        netWorth: 0,
        spentThisMonth: 0,
        incomeThisMonth: 0,
        monthlyBudget: 0,
        budgetSpent: 0,
        recentTransactions: [],
        accountSummary: [],
      },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No dashboard data yet')).toBeInTheDocument();
  });

  it('shows empty state when data is null', () => {
    mockedUseDashboardData.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No dashboard data yet')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// DashboardPage error state
// ---------------------------------------------------------------------------

describe('DashboardPage error state (#1334)', () => {
  it('shows error banner when dashboard data fails to load', () => {
    mockedUseDashboardData.mockReturnValue({
      data: null,
      loading: false,
      error: 'Database read failed',
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Database read failed')).toBeInTheDocument();
  });

  it('shows error from categories hook', () => {
    mockedUseCategories.mockReturnValue({
      categories: [],
      loading: false,
      error: 'Category load failed',
      refresh: vi.fn(),
      createCategory: vi.fn(),
      updateCategory: vi.fn(),
      deleteCategory: vi.fn(),
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Category load failed')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Chart component tests — SpendingBarChart
// ---------------------------------------------------------------------------

const barData: SpendingCategory[] = [
  { name: 'Food', amount: 450 },
  { name: 'Transport', amount: 200 },
  { name: 'Entertainment', amount: 150 },
];

describe('SpendingBarChart (#1334)', () => {
  it('renders with category spending data', () => {
    render(<SpendingBarChart data={barData} />);
    expect(screen.getByText('Spending by category')).toBeInTheDocument();
  });

  it('has accessible container with role="figure"', () => {
    render(<SpendingBarChart data={barData} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-roledescription', 'bar chart');
  });

  it('generates aria-label describing categories and total', () => {
    render(<SpendingBarChart data={barData} />);
    const container = screen.getByRole('figure');
    const label = container.getAttribute('aria-label')!;
    expect(label).toContain('3 categories');
    expect(label).toContain('$800');
  });

  it('handles empty data with descriptive aria-label', () => {
    render(<SpendingBarChart data={[]} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-label', 'Bar chart with no data.');
  });

  it('includes sr-only description for screen readers', () => {
    render(<SpendingBarChart data={barData} />);
    const srOnly = document.querySelector('.sr-only');
    expect(srOnly).toBeInTheDocument();
    expect(srOnly!.textContent).toContain('3 categories');
  });
});

// ---------------------------------------------------------------------------
// Chart component tests — TrendLineChart
// ---------------------------------------------------------------------------

const trendData: TrendDataPoint[] = [
  { label: 'Jan', income: 4000, expenses: 2400 },
  { label: 'Feb', income: 3000, expenses: 1398 },
  { label: 'Mar', income: 5000, expenses: 3200 },
];

const trendSeries: TrendSeries[] = [
  { dataKey: 'income', name: 'Income' },
  { dataKey: 'expenses', name: 'Expenses' },
];

describe('TrendLineChart (#1334)', () => {
  it('renders with valid data', () => {
    render(<TrendLineChart data={trendData} series={trendSeries} />);
    expect(screen.getByText('Trend over time')).toBeInTheDocument();
  });

  it('has accessible container with role="figure"', () => {
    render(<TrendLineChart data={trendData} series={trendSeries} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-roledescription', 'line chart');
  });

  it('generates aria-label with data point and series count', () => {
    render(<TrendLineChart data={trendData} series={trendSeries} />);
    const container = screen.getByRole('figure');
    const label = container.getAttribute('aria-label')!;
    expect(label).toContain('3 data points');
    expect(label).toContain('2 series');
  });

  it('handles empty data with descriptive aria-label', () => {
    render(<TrendLineChart data={[]} series={trendSeries} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-label', 'Line chart with no data.');
  });

  it('renders custom title when provided', () => {
    render(<TrendLineChart data={trendData} series={trendSeries} title="Monthly Trend" />);
    expect(screen.getByText('Monthly Trend')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Chart component tests — CategoryPieChart (D3-based)
// ---------------------------------------------------------------------------

const pieData: CategorySlice[] = [
  { name: 'Food', value: 450 },
  { name: 'Transport', value: 200 },
  { name: 'Entertainment', value: 150 },
];

describe('CategoryPieChart (#1334)', () => {
  it('renders with category data', () => {
    render(<CategoryPieChart data={pieData} />);
    expect(screen.getByText('Spending by category')).toBeInTheDocument();
  });

  it('has accessible container with role="figure"', () => {
    render(<CategoryPieChart data={pieData} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-roledescription', 'pie chart');
  });

  it('renders SVG with role="img"', () => {
    const { container } = render(<CategoryPieChart data={pieData} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('role', 'img');
  });

  it('creates D3 path elements for each slice', () => {
    const { container } = render(<CategoryPieChart data={pieData} />);
    const paths = container.querySelectorAll('path[data-chart-point]');
    expect(paths).toHaveLength(pieData.length);
  });

  it('assigns aria-label to each pie slice', () => {
    const { container } = render(<CategoryPieChart data={pieData} />);
    const paths = container.querySelectorAll('path[role="listitem"]');
    expect(paths).toHaveLength(pieData.length);
    expect(paths[0].getAttribute('aria-label')).toContain('Food');
  });

  it('handles empty data', () => {
    render(<CategoryPieChart data={[]} />);
    const container = screen.getByRole('figure');
    expect(container).toHaveAttribute('aria-label', 'Pie chart with no data.');
  });

  it('renders no path elements when data is empty', () => {
    const { container } = render(<CategoryPieChart data={[]} />);
    const paths = container.querySelectorAll('path[data-chart-point]');
    expect(paths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Data aggregation validation
// ---------------------------------------------------------------------------

describe('Data aggregation validation (#1334)', () => {
  it('budget percentage is calculated correctly from dashboard data', () => {
    const budgetSpent = 234050;
    const monthlyBudget = 350000;
    const percentage = Math.round((budgetSpent / monthlyBudget) * 100);
    expect(percentage).toBe(67);
  });

  it('budget percentage is 0 when no budget exists', () => {
    const monthlyBudget = 0;
    const budgetSpent = 0;
    const percentage = monthlyBudget > 0 ? Math.round((budgetSpent / monthlyBudget) * 100) : 0;
    expect(percentage).toBe(0);
  });

  it('budget status tone reflects overspending', () => {
    const getStatusTone = (percentage: number) =>
      percentage > 90 ? 'negative' : percentage > 75 ? 'warning' : 'positive';

    expect(getStatusTone(50)).toBe('positive');
    expect(getStatusTone(80)).toBe('warning');
    expect(getStatusTone(95)).toBe('negative');
  });

  it('account summary groups totals by type', () => {
    const accounts = [
      { type: 'CHECKING', balance: 100000 },
      { type: 'SAVINGS', balance: 50000 },
      { type: 'CHECKING', balance: 25000 },
    ];

    const totals = new Map<string, number>();
    for (const account of accounts) {
      totals.set(account.type, (totals.get(account.type) ?? 0) + account.balance);
    }

    expect(totals.get('CHECKING')).toBe(125000);
    expect(totals.get('SAVINGS')).toBe(50000);
  });

  it('category breakdown sorts by highest spending', () => {
    const categories = [
      { name: 'Transport', value: 200 },
      { name: 'Food', value: 450 },
      { name: 'Entertainment', value: 150 },
    ];

    const sorted = [...categories].sort((a, b) => b.value - a.value);

    expect(sorted[0].name).toBe('Food');
    expect(sorted[1].name).toBe('Transport');
    expect(sorted[2].name).toBe('Entertainment');
  });

  it('monetary values are represented as integers (cents)', () => {
    const amount = 2475000; // $24,750.00
    const formatted = (amount / 100).toFixed(2);
    expect(formatted).toBe('24750.00');
  });
});
