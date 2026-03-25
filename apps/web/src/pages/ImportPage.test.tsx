// SPDX-License-Identifier: MIT

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useAccounts } from '../hooks/useAccounts';
import { useImport } from '../hooks/useImport';
import type { UseImportResult } from '../hooks/useImport';
import { ImportPage } from './ImportPage';

// Mock each hook file individually — the page imports from the individual
// paths, not the barrel, so the barrel mock would not intercept them.
vi.mock('../hooks/useAccounts', () => ({ useAccounts: vi.fn() }));
vi.mock('../hooks/useImport', () => ({ useImport: vi.fn() }));

const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseImport = vi.mocked(useImport);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

// ---------------------------------------------------------------------------
// Shared mock builders
// ---------------------------------------------------------------------------

const uploadFileMock = vi.fn();
const setColumnMappingMock = vi.fn();
const confirmMappingMock = vi.fn();
const toggleSkipDuplicateMock = vi.fn();
const skipAllDuplicatesMock = vi.fn();
const startImportMock = vi.fn();
const goBackMock = vi.fn();
const resetMock = vi.fn();
const setSelectedAccountIdMock = vi.fn();
const setSelectedHouseholdIdMock = vi.fn();

function baseImportState(overrides: Partial<UseImportResult> = {}): UseImportResult {
  return {
    step: 'upload',

    // Upload
    file: null,
    parseResult: null,
    uploadFile: uploadFileMock,
    uploadError: null,

    // Mapping
    mappingSuggestions: [],
    columnMapping: {},
    setColumnMapping: setColumnMappingMock,
    confirmMapping: confirmMappingMock,

    // Preview
    validationResult: null,
    duplicates: [],
    skippedDuplicates: new Set(),
    toggleSkipDuplicate: toggleSkipDuplicateMock,
    skipAllDuplicates: skipAllDuplicatesMock,

    // Import
    importProgress: { current: 0, total: 0 },
    startImport: startImportMock,

    // Complete
    importSummary: null,

    // Navigation
    goBack: goBackMock,
    reset: resetMock,

    // Account & household
    selectedAccountId: null,
    setSelectedAccountId: setSelectedAccountIdMock,
    selectedHouseholdId: null,
    setSelectedHouseholdId: setSelectedHouseholdIdMock,

    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>,
  );
}

describe('ImportPage', () => {
  beforeEach(() => {
    uploadFileMock.mockReset();
    setColumnMappingMock.mockReset();
    confirmMappingMock.mockReset();
    toggleSkipDuplicateMock.mockReset();
    skipAllDuplicatesMock.mockReset();
    startImportMock.mockReset();
    goBackMock.mockReset();
    resetMock.mockReset();
    setSelectedAccountIdMock.mockReset();
    setSelectedHouseholdIdMock.mockReset();

    mockedUseAccounts.mockReturnValue({
      accounts: [
        {
          id: 'account-1',
          householdId: 'household-1',
          name: 'Checking',
          type: 'CHECKING',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 520000 },
          isArchived: false,
          sortOrder: 1,
          icon: 'bank',
          color: '#2563EB',
          ...syncMetadata,
        },
        {
          id: 'account-2',
          householdId: 'household-1',
          name: 'Savings',
          type: 'SAVINGS',
          currency: { code: 'USD', decimalPlaces: 2 },
          currentBalance: { amount: 1500000 },
          isArchived: false,
          sortOrder: 2,
          icon: 'piggy-bank',
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

    mockedUseImport.mockReturnValue(baseImportState());
  });

  // ---------------------------------------------------------------------------
  // Page header
  // ---------------------------------------------------------------------------

  it('renders the page title', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /import transactions/i })).toBeInTheDocument();
  });

  it('renders the step indicator', () => {
    renderPage();

    expect(screen.getByRole('navigation', { name: /import progress/i })).toBeInTheDocument();
  });

  // =========================================================================
  // Step 1: Upload
  // =========================================================================

  describe('Upload step', () => {
    it('renders upload heading', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: /upload csv file/i })).toBeInTheDocument();
    });

    it('renders file input', () => {
      renderPage();

      expect(screen.getByLabelText(/choose csv file to import/i)).toBeInTheDocument();
    });

    it('renders account selector', () => {
      renderPage();

      const select = screen.getByRole('combobox', { name: /import into account/i });
      expect(select).toBeInTheDocument();
    });

    it('lists accounts in selector', () => {
      renderPage();

      expect(screen.getByRole('option', { name: 'Checking' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Savings' })).toBeInTheDocument();
    });

    it('shows upload error when present', () => {
      mockedUseImport.mockReturnValue(
        baseImportState({ uploadError: 'Please select a .csv file.' }),
      );

      renderPage();

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Please select a .csv file.')).toBeInTheDocument();
    });

    it('shows drag and drop zone', () => {
      renderPage();

      expect(screen.getByText(/drag and drop your csv file/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Step 2: Mapping
  // =========================================================================

  describe('Mapping step', () => {
    beforeEach(() => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'mapping',
          parseResult: {
            headers: ['Date', 'Amount', 'Description'],
            rows: [
              ['2025-03-01', '67.42', 'Grocery Store'],
              ['2025-03-02', '12.50', 'Coffee Shop'],
            ],
            totalRows: 2,
            delimiter: ',',
          },
          columnMapping: { 0: 'date', 1: 'amount' },
          mappingSuggestions: [
            {
              columnIndex: 0,
              columnHeader: 'Date',
              suggestedField: 'date',
              confidence: 0.95,
            },
            {
              columnIndex: 1,
              columnHeader: 'Amount',
              suggestedField: 'amount',
              confidence: 0.9,
            },
            {
              columnIndex: 2,
              columnHeader: 'Description',
              suggestedField: 'description',
              confidence: 0.6,
            },
          ],
          selectedAccountId: 'account-1',
        }),
      );
    });

    it('renders mapping heading', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: /map columns/i })).toBeInTheDocument();
    });

    it('renders column mapping table', () => {
      renderPage();

      expect(screen.getByRole('table', { name: /column mapping/i })).toBeInTheDocument();
    });

    it('displays CSV column headers in mapping table', () => {
      renderPage();

      const table = screen.getByRole('table', { name: /column mapping/i });
      // CSV column headers are rendered inside <strong> elements in the table.
      // The same text also appears in <option> elements, so we query <strong> directly.
      const strongElements = table.querySelectorAll('strong');
      const headerTexts = Array.from(strongElements).map((el) => el.textContent);
      expect(headerTexts).toContain('Date');
      expect(headerTexts).toContain('Amount');
      expect(headerTexts).toContain('Description');
    });

    it('renders mapping dropdowns for each column', () => {
      renderPage();

      expect(
        screen.getByRole('combobox', { name: /map "date" to transaction field/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: /map "amount" to transaction field/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: /map "description" to transaction field/i }),
      ).toBeInTheDocument();
    });

    it('shows confidence indicators', () => {
      renderPage();

      expect(screen.getByText(/high \(95%\)/i)).toBeInTheDocument();
      expect(screen.getByText(/high \(90%\)/i)).toBeInTheDocument();
      expect(screen.getByText(/medium \(60%\)/i)).toBeInTheDocument();
    });

    it('shows data preview in rows', () => {
      renderPage();

      expect(screen.getByText(/67\.42/)).toBeInTheDocument();
    });

    it('has back button', () => {
      renderPage();

      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('calls goBack when back button is clicked', () => {
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(goBackMock).toHaveBeenCalled();
    });

    it('has continue button', () => {
      renderPage();

      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });

    it('disables continue when required fields are not mapped', () => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'mapping',
          parseResult: {
            headers: ['Col A', 'Col B'],
            rows: [['val1', 'val2']],
            totalRows: 1,
            delimiter: ',',
          },
          columnMapping: {},
          selectedAccountId: 'account-1',
        }),
      );

      renderPage();

      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).toBeDisabled();
    });
  });

  // =========================================================================
  // Step 3: Preview
  // =========================================================================

  describe('Preview step', () => {
    beforeEach(() => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'preview',
          validationResult: {
            valid: [
              {
                data: {
                  householdId: 'household-1',
                  accountId: 'account-1',
                  type: 'EXPENSE',
                  amount: { amount: 6742 },
                  date: '2025-03-01',
                },
                rowIndex: 0,
                warnings: [],
              },
              {
                data: {
                  householdId: 'household-1',
                  accountId: 'account-1',
                  type: 'EXPENSE',
                  amount: { amount: 1250 },
                  date: '2025-03-02',
                },
                rowIndex: 1,
                warnings: [],
              },
            ],
            errors: [
              {
                rowIndex: 2,
                field: 'amount',
                message: 'Amount is required',
              },
            ],
            totalRows: 3,
          },
          duplicates: [
            {
              importRow: {
                data: {
                  householdId: 'household-1',
                  accountId: 'account-1',
                  type: 'EXPENSE',
                  amount: { amount: 6742 },
                  date: '2025-03-01',
                },
                rowIndex: 0,
                warnings: [],
              },
              existingTransaction: {
                id: 'existing-tx-1',
                householdId: 'household-1',
                accountId: 'account-1',
                categoryId: null,
                type: 'EXPENSE',
                status: 'CLEARED',
                amount: { amount: 6742 },
                currency: { code: 'USD', decimalPlaces: 2 },
                payee: 'Grocery Store',
                note: null,
                date: '2025-03-01',
                transferAccountId: null,
                transferTransactionId: null,
                isRecurring: false,
                recurringRuleId: null,
                tags: [],
                ...syncMetadata,
              },
              matchScore: 0.85,
              matchReasons: ['Same date', 'Same amount'],
            },
          ],
          skippedDuplicates: new Set<number>(),
        }),
      );
    });

    it('renders preview heading', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: /preview import/i })).toBeInTheDocument();
    });

    it('displays summary stats', () => {
      renderPage();

      expect(screen.getByText('Valid rows')).toBeInTheDocument();
      expect(screen.getByText('Errors')).toBeInTheDocument();
      expect(screen.getByText('Potential duplicates')).toBeInTheDocument();
      expect(screen.getByText('Will be imported')).toBeInTheDocument();
    });

    it('shows valid row count', () => {
      renderPage();

      const summary = screen.getByRole('group', { name: /import summary/i });
      expect(summary).toBeInTheDocument();
    });

    it('displays validation error table', () => {
      renderPage();

      expect(screen.getByRole('table', { name: /validation errors/i })).toBeInTheDocument();
      expect(screen.getByText('Amount is required')).toBeInTheDocument();
    });

    it('displays validation error row details', () => {
      renderPage();

      expect(screen.getByText('amount')).toBeInTheDocument();
    });

    it('displays duplicate table', () => {
      renderPage();

      expect(
        screen.getByRole('table', { name: /potential duplicate transactions/i }),
      ).toBeInTheDocument();
    });

    it('shows match score for duplicates', () => {
      renderPage();

      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('shows match reasons for duplicates', () => {
      renderPage();

      expect(screen.getByText('Same date, Same amount')).toBeInTheDocument();
    });

    it('has skip all duplicates button', () => {
      renderPage();

      const button = screen.getByRole('button', { name: /skip all duplicates/i });
      expect(button).toBeInTheDocument();

      fireEvent.click(button);
      expect(skipAllDuplicatesMock).toHaveBeenCalled();
    });

    it('has skip checkbox for each duplicate', () => {
      renderPage();

      const checkbox = screen.getByRole('checkbox', { name: /skip row 1/i });
      expect(checkbox).toBeInTheDocument();

      fireEvent.click(checkbox);
      expect(toggleSkipDuplicateMock).toHaveBeenCalledWith(0);
    });

    it('has import button with count', () => {
      renderPage();

      expect(screen.getByRole('button', { name: /import 2 transactions/i })).toBeInTheDocument();
    });

    it('disables import when importable count is zero', () => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'preview',
          validationResult: {
            valid: [],
            errors: [{ rowIndex: 0, field: 'amount', message: 'Required' }],
            totalRows: 1,
          },
          duplicates: [],
          skippedDuplicates: new Set<number>(),
        }),
      );

      renderPage();

      expect(screen.getByRole('button', { name: /import 0 transactions/i })).toBeDisabled();
    });

    it('has back button', () => {
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(goBackMock).toHaveBeenCalled();
    });

    it('calls startImport when import button is clicked', () => {
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /import 2 transactions/i }));
      expect(startImportMock).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Step 4: Importing
  // =========================================================================

  describe('Importing step', () => {
    beforeEach(() => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'importing',
          importProgress: { current: 25, total: 100 },
        }),
      );
    });

    it('renders importing heading', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: /importing transactions/i })).toBeInTheDocument();
    });

    it('shows progress bar with ARIA attributes', () => {
      renderPage();

      const progressBar = screen.getByRole('progressbar', { name: /import progress/i });
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '25');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('shows progress text', () => {
      renderPage();

      expect(screen.getByText(/importing 25 of 100/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Step 5: Complete
  // =========================================================================

  describe('Complete step', () => {
    beforeEach(() => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'complete',
          importSummary: {
            imported: 45,
            skipped: 3,
            errors: 2,
          },
        }),
      );
    });

    it('renders complete heading', () => {
      renderPage();

      expect(screen.getByRole('heading', { name: /import complete/i })).toBeInTheDocument();
    });

    it('displays import results', () => {
      renderPage();

      expect(screen.getByRole('group', { name: /import results/i })).toBeInTheDocument();
    });

    it('shows imported count', () => {
      renderPage();

      expect(screen.getByText('45')).toBeInTheDocument();
      expect(screen.getByText('Imported')).toBeInTheDocument();
    });

    it('shows skipped count', () => {
      renderPage();

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Skipped')).toBeInTheDocument();
    });

    it('shows error count', () => {
      renderPage();

      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Errors')).toBeInTheDocument();
    });

    it('has view transactions link', () => {
      renderPage();

      const link = screen.getByRole('link', { name: /view transactions/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/transactions');
    });

    it('has import more button', () => {
      renderPage();

      const button = screen.getByRole('button', { name: /import more/i });
      expect(button).toBeInTheDocument();

      fireEvent.click(button);
      expect(resetMock).toHaveBeenCalled();
    });

    it('hides error stat when no errors', () => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'complete',
          importSummary: {
            imported: 50,
            skipped: 0,
            errors: 0,
          },
        }),
      );

      renderPage();

      // "Errors" label should not appear when error count is 0
      expect(screen.queryByText('Errors')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Step indicator
  // =========================================================================

  describe('Step indicator', () => {
    it('marks current step as active', () => {
      renderPage();

      const steps = screen.getAllByRole('listitem');
      const uploadStep = steps.find((s) => s.textContent?.includes('Upload File'));
      expect(uploadStep).toHaveAttribute('aria-current', 'step');
    });

    it('announces current step for screen readers', () => {
      renderPage();

      expect(screen.getByText(/step 1 of 5: upload file/i)).toBeInTheDocument();
    });

    it('marks completed steps with checkmark on mapping step', () => {
      mockedUseImport.mockReturnValue(
        baseImportState({
          step: 'mapping',
          parseResult: {
            headers: ['Date'],
            rows: [['2025-01-01']],
            totalRows: 1,
            delimiter: ',',
          },
        }),
      );

      renderPage();

      expect(screen.getByText(/step 2 of 5: map columns/i)).toBeInTheDocument();
    });
  });
});
