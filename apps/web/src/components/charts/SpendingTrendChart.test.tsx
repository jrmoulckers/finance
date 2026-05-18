// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { SpendingTrendChart, type SpendingTrendChartProps } from './SpendingTrendChart';

// Mock window.matchMedia for jsdom
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Line: () => null,
  Bar: () => null,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

vi.mock('../../accessibility/aria', () => ({
  useArrowKeyNavigation: () => ({ handleKeyDown: vi.fn() }),
}));

const mockData = [
  { label: 'Jan 1', spending: 50 },
  { label: 'Jan 2', spending: 30 },
  { label: 'Jan 3', spending: 75 },
];

const defaultProps: SpendingTrendChartProps = {
  data: mockData,
  currency: 'USD',
  title: 'Spending Trend',
  selectedPeriod: '30d',
  onPeriodChange: vi.fn(),
  viewType: 'line',
  onViewTypeChange: vi.fn(),
  averageDailySpending: 51.67,
  comparison: { percentChange: 15, absoluteChange: 25 },
};

describe('SpendingTrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the chart title', () => {
    render(<SpendingTrendChart {...defaultProps} />);
    expect(screen.getByText('Spending Trend')).toBeInTheDocument();
  });

  it('renders period selector buttons', () => {
    render(<SpendingTrendChart {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Show 7D spending trend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show 30D spending trend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show 90D spending trend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show 1Y spending trend/i })).toBeInTheDocument();
  });

  it('marks the active period button as pressed', () => {
    render(<SpendingTrendChart {...defaultProps} selectedPeriod="30d" />);
    const btn = screen.getByRole('button', { name: /Show 30D spending trend/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onPeriodChange when a period button is clicked', () => {
    const onPeriodChange = vi.fn();
    render(<SpendingTrendChart {...defaultProps} onPeriodChange={onPeriodChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Show 7D spending trend/i }));
    expect(onPeriodChange).toHaveBeenCalledWith('7d');
  });

  it('renders view type toggle buttons', () => {
    render(<SpendingTrendChart {...defaultProps} />);
    expect(screen.getByRole('button', { name: /Line chart view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bar chart view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Area chart view/i })).toBeInTheDocument();
  });

  it('calls onViewTypeChange when view button is clicked', () => {
    const onViewTypeChange = vi.fn();
    render(<SpendingTrendChart {...defaultProps} onViewTypeChange={onViewTypeChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Bar chart view/i }));
    expect(onViewTypeChange).toHaveBeenCalledWith('bar');
  });

  it('displays average daily spending annotation', () => {
    render(<SpendingTrendChart {...defaultProps} averageDailySpending={51.67} />);
    expect(screen.getByText(/Avg \$52\/day/)).toBeInTheDocument();
  });

  it('displays period comparison with up indicator', () => {
    render(
      <SpendingTrendChart
        {...defaultProps}
        comparison={{ percentChange: 15, absoluteChange: 25 }}
      />,
    );
    expect(screen.getByText(/\+15% vs last period/)).toBeInTheDocument();
  });

  it('displays period comparison with down indicator', () => {
    render(
      <SpendingTrendChart
        {...defaultProps}
        comparison={{ percentChange: -10, absoluteChange: -15 }}
      />,
    );
    expect(screen.getByText(/\+10% vs last period/)).toBeInTheDocument();
  });

  it('renders line chart by default', () => {
    render(<SpendingTrendChart {...defaultProps} viewType="line" />);
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders bar chart when viewType is bar', () => {
    render(<SpendingTrendChart {...defaultProps} viewType="bar" />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders area chart when viewType is area', () => {
    render(<SpendingTrendChart {...defaultProps} viewType="area" />);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<SpendingTrendChart {...defaultProps} data={[]} />);
    expect(screen.getByText('No spending data for this period.')).toBeInTheDocument();
  });

  it('has accessible figure role with description', () => {
    const { container } = render(<SpendingTrendChart {...defaultProps} />);
    const figure = container.querySelector('[role="figure"]');
    expect(figure).toBeInTheDocument();
    expect(figure).toHaveAttribute('aria-roledescription', 'spending trend chart');
  });

  it('hides comparison when null', () => {
    render(<SpendingTrendChart {...defaultProps} comparison={null} />);
    expect(screen.queryByText(/vs last period/)).not.toBeInTheDocument();
  });
});
