// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseContext, type DatabaseContextValue } from '../db/DatabaseProvider';
import type { SqliteDb } from '../db/sqlite-wasm';
import { useDataImportWizard } from '../hooks/useDataImportWizard';
import type { UseDataImportWizardResult } from '../hooks/useDataImportWizard';
import { DataImportWizardPage } from './DataImportWizardPage';

vi.mock('../hooks/useDataImportWizard', () => ({
  useDataImportWizard: vi.fn(),
}));

const mockedHook = vi.mocked(useDataImportWizard);

const mockDb: SqliteDb = {
  exec: vi.fn(),
  selectAll: vi.fn(() => []),
  selectOne: vi.fn(() => null),
  close: vi.fn().mockResolvedValue(undefined),
};

const databaseContextValue: DatabaseContextValue = {
  db: mockDb,
  diagnostics: {
    backend: 'indexeddb',
    opfsAvailable: false,
    didFallback: false,
    quotaBytes: null,
    usageBytes: null,
  },
};

function renderWithDatabase(ui: ReactNode) {
  return render(
    <DatabaseContext.Provider value={databaseContextValue}>{ui}</DatabaseContext.Provider>,
  );
}

function mockResult(overrides: Partial<UseDataImportWizardResult> = {}): UseDataImportWizardResult {
  return {
    step: 'upload',
    detectedFormat: 'unknown',
    detectedFormatLabel: 'Unknown format',
    csvColumns: [],
    csvRows: [],
    columnMappings: [],
    previewRows: [],
    unmappedFields: [],
    duplicateComparisons: [],
    duplicateActions: {},
    progress: null,
    result: null,
    error: null,
    uploadFile: vi.fn(),
    setColumnMapping: vi.fn(),
    updatePreviewField: vi.fn(),
    setDuplicateAction: vi.fn(),
    mapUnmappedToNotes: vi.fn(),
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

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText('Import & Restore Data')).toBeInTheDocument();
  });

  it('shows upload step by default', () => {
    mockedHook.mockReturnValue(mockResult());

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText('Upload CSV File')).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
  });

  it('shows step indicator', () => {
    mockedHook.mockReturnValue(mockResult());

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText('Upload File')).toBeInTheDocument();
    expect(screen.getByText('Map Columns')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('lists supported bank formats in upload hint', () => {
    mockedHook.mockReturnValue(mockResult());

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText(/Chase, Amex, Wells Fargo, Citi/)).toBeInTheDocument();
  });

  it('shows mapping step with columns and detected format label', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'mapping',
        detectedFormat: 'chase',
        detectedFormatLabel: 'Chase credit card format',
        csvColumns: [
          { index: 0, name: 'Transaction Date', sampleValues: ['01/15/2025'] },
          { index: 1, name: 'Description', sampleValues: ['Store'] },
          { index: 2, name: 'Amount', sampleValues: ['-45.00'] },
        ],
        csvRows: [['01/15/2025', 'Store', '-45.00']],
        columnMappings: [
          { columnIndex: 0, columnName: 'Transaction Date', mappedField: 'date' },
          { columnIndex: 1, columnName: 'Description', mappedField: 'payee' },
          { columnIndex: 2, columnName: 'Amount', mappedField: 'amount' },
        ],
        unmappedFields: [],
      }),
    );

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByRole('heading', { name: 'Map Columns' })).toBeInTheDocument();
    expect(screen.getByText('Detected: Chase credit card format')).toBeInTheDocument();
  });

  it('shows unmapped fields warning when fields are skipped', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'mapping',
        detectedFormat: 'chase',
        detectedFormatLabel: 'Chase credit card format',
        csvColumns: [
          { index: 0, name: 'Transaction Date', sampleValues: ['01/15/2025'] },
          { index: 1, name: 'Post Date', sampleValues: ['01/16/2025'] },
        ],
        csvRows: [['01/15/2025', '01/16/2025']],
        columnMappings: [
          { columnIndex: 0, columnName: 'Transaction Date', mappedField: 'date' },
          { columnIndex: 1, columnName: 'Post Date', mappedField: 'skip' },
        ],
        unmappedFields: [{ columnIndex: 1, columnName: 'Post Date', sampleValue: '01/16/2025' }],
      }),
    );

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText(/These fields will not be imported/)).toBeInTheDocument();
    expect(screen.getAllByText('Post Date').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /map.*notes/i })).toBeInTheDocument();
  });

  it('shows preview step with card-based layout and stats', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'preview',
        previewRows: [
          {
            rowIndex: 0,
            values: { date: '01/15/2025', payee: 'Store', amount: '45.00' },
            parsed: {
              date: '01/15/2025',
              payee: 'Store',
              amountCents: 4500,
              category: null,
              account: null,
              note: null,
            },
            isDuplicate: false,
            hasError: false,
            errorMessage: null,
            fieldErrors: {},
          },
          {
            rowIndex: 1,
            values: { date: '01/16/2025', payee: 'Gas', amount: '30.50' },
            parsed: {
              date: '01/16/2025',
              payee: 'Gas',
              amountCents: 3050,
              category: null,
              account: null,
              note: null,
            },
            isDuplicate: false,
            hasError: false,
            errorMessage: null,
            fieldErrors: {},
          },
        ],
      }),
    );

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText('Preview (2 transactions)')).toBeInTheDocument();
    expect(screen.getByText(/2 valid/)).toBeInTheDocument();
  });

  it('shows duplicate comparison cards for duplicate rows', () => {
    mockedHook.mockReturnValue(
      mockResult({
        step: 'preview',
        previewRows: [
          {
            rowIndex: 0,
            values: { date: '01/15/2025', payee: 'Store', amount: '45.00' },
            parsed: {
              date: '01/15/2025',
              payee: 'Store',
              amountCents: 4500,
              category: null,
              account: null,
              note: null,
            },
            isDuplicate: true,
            hasError: false,
            errorMessage: null,
            fieldErrors: {},
          },
        ],
        duplicateComparisons: [
          {
            rowIndex: 0,
            importRow: {
              rowIndex: 0,
              values: {},
              parsed: {
                date: '01/15/2025',
                payee: 'Store',
                amountCents: 4500,
                category: null,
                account: null,
                note: null,
              },
              isDuplicate: true,
              hasError: false,
              errorMessage: null,
              fieldErrors: {},
            },
            existingTransaction: {
              date: '01/15/2025',
              payee: 'Store',
              amount: '$45.00',
              category: 'Uncategorized',
            },
            differences: [],
          },
        ],
      }),
    );

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText('Duplicate Review (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Anyway' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
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

    renderWithDatabase(<DataImportWizardPage />);
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

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByText('Import Complete!')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import another/i })).toBeInTheDocument();
  });

  it('shows error banner', () => {
    mockedHook.mockReturnValue(mockResult({ error: 'Invalid file format' }));

    renderWithDatabase(<DataImportWizardPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid file format');
  });
});
