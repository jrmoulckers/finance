// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReportBuilder } from '../hooks/useReportBuilder';
import type { UseReportBuilderResult, ReportConfig } from '../hooks/useReportBuilder';
import { ReportBuilderPage } from './ReportBuilderPage';

vi.mock('../hooks/useReportBuilder', () => ({
  useReportBuilder: vi.fn(),
}));

const mockedUseReportBuilder = vi.mocked(useReportBuilder);

const defaultConfig: ReportConfig = {
  name: 'Custom Report',
  fields: [
    { id: 'field-date', type: 'date', label: 'Date', visible: true, sortOrder: 0 },
    { id: 'field-payee', type: 'payee', label: 'Payee', visible: true, sortOrder: 1 },
    { id: 'field-amount', type: 'amount', label: 'Amount', visible: true, sortOrder: 2 },
    { id: 'field-note', type: 'note', label: 'Note', visible: false, sortOrder: 5 },
  ],
  startDate: null,
  endDate: null,
  categoryIds: [],
  accountIds: [],
  groupBy: 'none',
  exportFormat: 'csv',
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
    setCategoryFilter: vi.fn(),
    setAccountFilter: vi.fn(),
    setGroupBy: vi.fn(),
    setExportFormat: vi.fn(),
    generatePreview: vi.fn(),
    exportReport: vi.fn(),
    resetConfig: vi.fn(),
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
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Group By')).toBeInTheDocument();
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
        },
      }),
    );

    rerender(<ReportBuilderPage />);
    expect(screen.getByRole('button', { name: /export.*csv/i })).toBeInTheDocument();
  });
});
