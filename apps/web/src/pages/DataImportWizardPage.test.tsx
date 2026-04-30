// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDataImportWizard } from '../hooks/useDataImportWizard';
import type { UseDataImportWizardResult } from '../hooks/useDataImportWizard';
import { DataImportWizardPage } from './DataImportWizardPage';

vi.mock('../hooks/useDataImportWizard', () => ({
  useDataImportWizard: vi.fn(),
}));

const mockedHook = vi.mocked(useDataImportWizard);

function mockResult(overrides: Partial<UseDataImportWizardResult> = {}): UseDataImportWizardResult {
  return {
    step: 'upload',
    detectedFormat: 'unknown',
    csvColumns: [],
    csvRows: [],
    columnMappings: [],
    previewRows: [],
    progress: null,
    result: null,
    error: null,
    uploadFile: vi.fn(),
    setColumnMapping: vi.fn(),
    goToPreview: vi.fn(),
    startImport: vi.fn(),
    goBack: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('DataImportWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the wizard title', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<DataImportWizardPage />);
    expect(screen.getByText('Import Transactions')).toBeInTheDocument();
  });

  it('shows upload step by default', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<DataImportWizardPage />);
    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
  });

  it('shows step indicator', () => {
    mockedHook.mockReturnValue(mockResult());

    render(<DataImportWizardPage />);
    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('Map Columns')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows mapping step with columns and format badge', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'mapping',
        detectedFormat: 'mint',
        csvColumns: [
          { index: 0, name: 'Date', sampleValues: ['01/15/2025'] },
          { index: 1, name: 'Description', sampleValues: ['Store'] },
          { index: 2, name: 'Amount', sampleValues: ['45.00'] },
        ],
        csvRows: [['01/15/2025', 'Store', '45.00']],
        columnMappings: [
          { columnIndex: 0, columnName: 'Date', mappedField: 'date' },
          { columnIndex: 1, columnName: 'Description', mappedField: 'payee' },
          { columnIndex: 2, columnName: 'Amount', mappedField: 'amount' },
        ],
      }),
    );

    render(<DataImportWizardPage />);
    expect(screen.getByRole('heading', { name: 'Map Columns' })).toBeInTheDocument();
    expect(screen.getByText('Mint Export')).toBeInTheDocument();
    expect(
      screen.getByText('1 rows found. Assign each CSV column to a transaction field.'),
    ).toBeInTheDocument();
  });

  it('shows preview step with stats', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'preview',
        previewRows: [
          {
            rowIndex: 0,
            values: { date: '01/15/2025', payee: 'Store', amount: '45.00' },
            parsed: { date: '01/15/2025', payee: 'Store', amountCents: 4500, category: null },
            isDuplicate: false,
            hasError: false,
            errorMessage: null,
          },
          {
            rowIndex: 1,
            values: { date: '01/16/2025', payee: 'Gas', amount: '30.50' },
            parsed: { date: '01/16/2025', payee: 'Gas', amountCents: 3050, category: null },
            isDuplicate: true,
            hasError: false,
            errorMessage: null,
          },
        ],
      }),
    );

    render(<DataImportWizardPage />);
    expect(screen.getByText('Preview (2 rows)')).toBeInTheDocument();
    expect(screen.getByText(/1 valid/)).toBeInTheDocument();
    expect(screen.getByText(/1 duplicates/)).toBeInTheDocument();
  });

  it('shows importing progress', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'importing',
        progress: {
          current: 5,
          total: 10,
          duplicatesSkipped: 0,
          errorsCount: 0,
          percentComplete: 50,
        },
      }),
    );

    render(<DataImportWizardPage />);
    expect(screen.getByText('Importing Transactions…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('5 / 10 transactions')).toBeInTheDocument();
  });

  it('shows completion state', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'complete',
        result: {
          imported: 8,
          duplicatesSkipped: 2,
          errors: 0,
          totalProcessed: 10,
        },
      }),
    );

    render(<DataImportWizardPage />);
    expect(screen.getByText('Import Complete!')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import another/i })).toBeInTheDocument();
  });

  it('shows error banner', () => {
    mockedHook.mockReturnValue(mockResult({ error: 'Invalid file format' }));

    render(<DataImportWizardPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid file format');
  });
});
