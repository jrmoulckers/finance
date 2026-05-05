// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReportBuilder } from '../hooks/useReportBuilder';
import type { UseReportBuilderResult, ReportConfig } from '../hooks/useReportBuilder';
import { ReportBuilderPage } from './ReportBuilderPage';

vi.mock('../hooks/useReportBuilder', () => ({
  useReportBuilder: vi.fn(),
}));

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}));

vi.mock('../components/charts/chart-palette', () => ({
  CHART_COLORS: ['#4F46E5'],
  formatChartCurrency: (v: number) => `$${(v / 100).toFixed(2)}`,
}));

const mockedUseReportBuilder = vi.mocked(useReportBuilder);

const defaultConfig: ReportConfig = {
  name: 'Custom Report',
  template: 'custom',
  fields: [
    { id: 'field-date', type: 'date', label: 'Date', visible: true, sortOrder: 0 },
    { id: 'field-payee', type: 'payee', label: 'Payee', visible: true, sortOrder: 1 },
    { id: 'field-amount', type: 'amount', label: 'Amount', visible: true, sortOrder: 2 },
    { id: 'field-note', type: 'note', label: 'Note', visible: false, sortOrder: 5 },
  ],
  startDate: null,
  endDate: null,
  datePreset: 'this-month',
  categoryIds: [],
  accountIds: [],
  groupBy: 'none',
  chartType: 'none',
  exportFormat: 'csv',
  isScheduled: false,
  scheduleFrequency: 'monthly',
};

function mockResult(overrides: Partial<UseReportBuilderResult> = {}): UseReportBuilderResult {
  return {
    config: defaultConfig,
    availableFields: [
      { id: 'field-note', type: 'note', label: 'Note', visible: false, sortOrder: 5 },
    ],
    preview: null,
    generating: false,
    error: null,
    setReportName: vi.fn(),
    addField: vi.fn(),
    removeField: vi.fn(),
    reorderFields: vi.fn(),
    toggleFieldVisibility: vi.fn(),
    setDateRange: vi.fn(),
    applyDatePreset: vi.fn(),
    setCategoryFilter: vi.fn(),
    setAccountFilter: vi.fn(),
    setGroupBy: vi.fn(),
    setChartType: vi.fn(),
    setExportFormat: vi.fn(),
    applyTemplate: vi.fn(),
    setScheduled: vi.fn(),
    setScheduleFrequency: vi.fn(),
    generatePreview: vi.fn(),
    exportReport: vi.fn(),
    resetConfig: vi.fn(),
    savedReports: [],
    saveReport: vi.fn(),
    loadReport: vi.fn(),
    deleteSavedReport: vi.fn(),
    ...overrides,
  };
}

describe('ReportBuilderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the report builder heading', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByText('Custom Report Builder')).toBeInTheDocument();
  });

  it('shows report name input', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByRole('textbox')).toHaveValue('Custom Report');
  });

  it('renders visible fields as draggable items', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Payee')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('shows add-field chips for hidden fields', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByRole('button', { name: /add note field/i })).toBeInTheDocument();
  });

  it('renders filter controls', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByLabelText('Group By')).toBeInTheDocument();
    expect(screen.getByLabelText('Chart Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Export Format')).toBeInTheDocument();
  });

  it('shows generate preview button', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByRole('button', { name: /generate preview/i })).toBeInTheDocument();
  });

  it('renders preview table when preview exists', () => {
    mockedUseReportBuilder.mockReturnValue(
      mockResult({
        preview: {
          headers: ['Date', 'Payee', 'Amount'],
          rows: [{ Date: '2025-01-15', Payee: 'Store', Amount: -4520 }],
          totalRows: 1,
          chartData: [{ name: 'Groceries', value: 4520 }],
          summary: {
            totalIncome: 0,
            totalExpenses: 4520,
            netAmount: -4520,
            transactionCount: 1,
          },
        },
      }),
    );

    render(<ReportBuilderPage />);
    expect(screen.getByText('Preview (1 rows)')).toBeInTheDocument();
    expect(screen.getByText('Store')).toBeInTheDocument();
  });

  it('shows error banner when error exists', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult({ error: 'Export failed' }));

    render(<ReportBuilderPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Export failed');
  });

  it('shows export button only when preview exists', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    const { rerender } = render(<ReportBuilderPage />);
    expect(screen.queryByRole('button', { name: /export.*csv/i })).not.toBeInTheDocument();

    mockedUseReportBuilder.mockReturnValue(
      mockResult({
        preview: {
          headers: ['Date'],
          rows: [{ Date: '2025-01-15' }],
          totalRows: 1,
          chartData: [],
          summary: {
            totalIncome: 0,
            totalExpenses: 0,
            netAmount: 0,
            transactionCount: 1,
          },
        },
      }),
    );

    rerender(<ReportBuilderPage />);
    expect(screen.getByRole('button', { name: /export.*csv/i })).toBeInTheDocument();
  });

  it('renders template picker cards', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByText('Monthly Summary')).toBeInTheDocument();
    expect(screen.getByText('Category Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Trend Analysis')).toBeInTheDocument();
    expect(screen.getByText('Custom Report')).toBeInTheDocument();
  });

  it('renders date preset buttons', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByRole('button', { name: 'This Month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Last Month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Year to Date' })).toBeInTheDocument();
  });

  it('renders schedule toggle', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByLabelText(/enable scheduled report/i)).toBeInTheDocument();
  });

  it('shows save button', () => {
    mockedUseReportBuilder.mockReturnValue(mockResult());

    render(<ReportBuilderPage />);
    expect(screen.getByRole('button', { name: /save current report/i })).toBeInTheDocument();
  });

  it('renders saved reports when available', () => {
    mockedUseReportBuilder.mockReturnValue(
      mockResult({
        savedReports: [
          {
            id: 'report-1',
            name: 'My Monthly Report',
            config: defaultConfig,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      }),
    );

    render(<ReportBuilderPage />);
    expect(screen.getByText('Saved Reports')).toBeInTheDocument();
    expect(screen.getByText('My Monthly Report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load report.*my monthly/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete report.*my monthly/i })).toBeInTheDocument();
  });

  it('renders summary when preview exists', () => {
    mockedUseReportBuilder.mockReturnValue(
      mockResult({
        preview: {
          headers: ['Date'],
          rows: [{ Date: '2025-01-15' }],
          totalRows: 1,
          chartData: [],
          summary: {
            totalIncome: 350000,
            totalExpenses: 22970,
            netAmount: 327030,
            transactionCount: 5,
          },
        },
      }),
    );

    render(<ReportBuilderPage />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('Expenses')).toBeInTheDocument();
    expect(screen.getByText('Net')).toBeInTheDocument();
  });

  it('renders bar chart when chart type is bar', () => {
    mockedUseReportBuilder.mockReturnValue(
      mockResult({
        config: { ...defaultConfig, chartType: 'bar' },
        preview: {
          headers: ['Date'],
          rows: [{ Date: '2025-01-15' }],
          totalRows: 1,
          chartData: [{ name: 'Groceries', value: 4520 }],
          summary: {
            totalIncome: 0,
            totalExpenses: 4520,
            netAmount: -4520,
            transactionCount: 1,
          },
        },
      }),
    );

    render(<ReportBuilderPage />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });
});
