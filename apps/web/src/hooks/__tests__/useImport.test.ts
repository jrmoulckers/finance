// SPDX-License-Identifier: MIT

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImport } from '../useImport';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateTransaction = vi.fn();
const mockTransactions = [
  {
    id: 'txn-1',
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: -5000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Store',
    note: null,
    date: '2025-01-15',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
];

vi.mock('../useTransactions', () => ({
  useTransactions: () => ({
    transactions: mockTransactions,
    createTransaction: mockCreateTransaction,
  }),
}));

const mockParseCsv = vi.fn();
const mockSuggestMappings = vi.fn();
const mockApplyMapping = vi.fn();

vi.mock('../../lib/csv-parser', () => ({
  parseCsv: (...args: unknown[]) => mockParseCsv(...args),
}));

vi.mock('../../lib/csv-column-mapper', () => ({
  suggestMappings: (...args: unknown[]) => mockSuggestMappings(...args),
  applyMapping: (...args: unknown[]) => mockApplyMapping(...args),
}));

const mockValidateImportRows = vi.fn();

vi.mock('../../lib/csv-import-validator', () => ({
  validateImportRows: (...args: unknown[]) => mockValidateImportRows(...args),
}));

const mockDetectDuplicates = vi.fn();

vi.mock('../../lib/csv-duplicate-detector', () => ({
  detectDuplicates: (...args: unknown[]) => mockDetectDuplicates(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCsvFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

// ---------------------------------------------------------------------------
// FileReader mock — jsdom's FileReader does not reliably fire onload for
// in-memory File objects, so we provide a minimal mock that resolves via
// a microtask.
// ---------------------------------------------------------------------------

let fileReaderResult: string;

class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;

  readAsText(): void {
    this.result = fileReaderResult;
    queueMicrotask(() => {
      this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>);
    });
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  fileReaderResult = 'Date,Amount,Description\n2025-01-15,-50.00,Groceries';
  vi.stubGlobal('FileReader', MockFileReader);

  mockParseCsv.mockReturnValue({
    headers: ['Date', 'Amount', 'Description'],
    rows: [['2025-01-15', '-50.00', 'Groceries']],
  });
  mockSuggestMappings.mockReturnValue([
    { columnIndex: 0, columnHeader: 'Date', suggestedField: 'date', confidence: 0.9 },
    { columnIndex: 1, columnHeader: 'Amount', suggestedField: 'amount', confidence: 0.9 },
    {
      columnIndex: 2,
      columnHeader: 'Description',
      suggestedField: 'description',
      confidence: 0.8,
    },
  ]);
  mockApplyMapping.mockReturnValue([
    { date: '2025-01-15', amount: '-50.00', description: 'Groceries' },
  ]);
  mockValidateImportRows.mockReturnValue({
    valid: [
      {
        rowIndex: 0,
        data: {
          householdId: 'hh-1',
          accountId: 'acct-1',
          type: 'EXPENSE',
          amount: { amount: -5000 },
          date: '2025-01-15',
          payee: 'Groceries',
        },
        warnings: [],
      },
    ],
    errors: [],
  });
  mockDetectDuplicates.mockReturnValue([]);
  mockCreateTransaction.mockReturnValue({ id: 'txn-new' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useImport', () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts at the upload step with no file', () => {
    const { result } = renderHook(() => useImport());

    expect(result.current.step).toBe('upload');
    expect(result.current.file).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.uploadError).toBeNull();
    expect(result.current.selectedAccountId).toBeNull();
    expect(result.current.selectedHouseholdId).toBeNull();
  });

  it('starts with empty mapping and no validation', () => {
    const { result } = renderHook(() => useImport());

    expect(result.current.columnMapping).toEqual({});
    expect(result.current.mappingSuggestions).toEqual([]);
    expect(result.current.validationResult).toBeNull();
    expect(result.current.duplicates).toEqual([]);
    expect(result.current.importSummary).toBeNull();
  });

  it('starts with zero import progress', () => {
    const { result } = renderHook(() => useImport());

    expect(result.current.importProgress).toEqual({ current: 0, total: 0 });
  });

  // -----------------------------------------------------------------------
  // File validation errors
  // -----------------------------------------------------------------------

  it('rejects non-CSV files', async () => {
    const { result } = renderHook(() => useImport());
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });

    act(() => {
      result.current.uploadFile(file);
    });

    expect(result.current.uploadError).toBe('Please select a .csv file.');
    expect(result.current.step).toBe('upload');
  });

  it('rejects files larger than 10 MB', () => {
    const { result } = renderHook(() => useImport());
    const largeContent = new ArrayBuffer(11 * 1024 * 1024);
    const file = new File([largeContent], 'large.csv', { type: 'text/csv' });

    act(() => {
      result.current.uploadFile(file);
    });

    expect(result.current.uploadError).toBe('File is too large. Maximum size is 10 MB.');
  });

  it('rejects empty files', () => {
    const { result } = renderHook(() => useImport());
    const file = new File([], 'empty.csv', { type: 'text/csv' });

    act(() => {
      result.current.uploadFile(file);
    });

    expect(result.current.uploadError).toBe('File is empty.');
  });

  // -----------------------------------------------------------------------
  // File upload success → mapping step
  // -----------------------------------------------------------------------

  it('transitions to mapping step on valid CSV upload', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    expect(result.current.file).toBe(file);
    expect(result.current.parseResult).not.toBeNull();
    expect(result.current.mappingSuggestions.length).toBeGreaterThan(0);
  });

  it('auto-populates column mapping from high-confidence suggestions', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    // All suggestions have confidence >= 0.5, so all should be mapped
    expect(Object.keys(result.current.columnMapping).length).toBe(3);
  });

  it('sets uploadError when CSV has no columns', async () => {
    mockParseCsv.mockReturnValue({ headers: [], rows: [] });

    const { result } = renderHook(() => useImport());

    // File size must be > 0 for it to pass the first validation
    const nonEmptyFile = new File(['some content'], 'test.csv', { type: 'text/csv' });

    act(() => {
      result.current.uploadFile(nonEmptyFile);
    });

    await waitFor(() => {
      expect(result.current.uploadError).not.toBeNull();
    });

    expect(result.current.uploadError).toBe(
      'CSV file has no columns. Please check the file format.',
    );
  });

  it('sets uploadError when CSV has no data rows', async () => {
    mockParseCsv.mockReturnValue({
      headers: ['Date', 'Amount'],
      rows: [],
    });

    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.uploadError).not.toBeNull();
    });

    expect(result.current.uploadError).toBe('CSV file has no data rows.');
  });

  // -----------------------------------------------------------------------
  // Column mapping
  // -----------------------------------------------------------------------

  it('allows updating column mapping', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    act(() => {
      result.current.setColumnMapping({ 0: 'date', 1: 'amount' });
    });

    expect(result.current.columnMapping).toEqual({ 0: 'date', 1: 'amount' });
  });

  // -----------------------------------------------------------------------
  // Confirm mapping → preview step
  // -----------------------------------------------------------------------

  it('transitions to preview step when mapping is confirmed with account selected', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    act(() => {
      result.current.setSelectedAccountId('acct-1');
    });

    act(() => {
      result.current.confirmMapping();
    });

    expect(result.current.step).toBe('preview');
    expect(result.current.validationResult).not.toBeNull();
  });

  it('does not advance when no account is selected', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    act(() => {
      result.current.confirmMapping();
    });

    // Should stay on mapping since no account selected
    expect(result.current.step).toBe('mapping');
  });

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  it('goBack navigates from mapping to upload', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    act(() => {
      result.current.goBack();
    });

    expect(result.current.step).toBe('upload');
  });

  it('goBack is a no-op on the upload step', () => {
    const { result } = renderHook(() => useImport());

    act(() => {
      result.current.goBack();
    });

    expect(result.current.step).toBe('upload');
  });

  it('reset returns to initial state', async () => {
    const { result } = renderHook(() => useImport());
    const file = createCsvFile('Date,Amount,Description\n2025-01-15,-50.00,Groceries');

    act(() => {
      result.current.uploadFile(file);
    });

    await waitFor(() => {
      expect(result.current.step).toBe('mapping');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.step).toBe('upload');
    expect(result.current.file).toBeNull();
    expect(result.current.parseResult).toBeNull();
    expect(result.current.columnMapping).toEqual({});
    expect(result.current.mappingSuggestions).toEqual([]);
    expect(result.current.importSummary).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Account / household selection
  // -----------------------------------------------------------------------

  it('allows setting selected account and household', () => {
    const { result } = renderHook(() => useImport());

    act(() => {
      result.current.setSelectedAccountId('acct-1');
      result.current.setSelectedHouseholdId('hh-1');
    });

    expect(result.current.selectedAccountId).toBe('acct-1');
    expect(result.current.selectedHouseholdId).toBe('hh-1');
  });

  // -----------------------------------------------------------------------
  // Duplicate handling
  // -----------------------------------------------------------------------

  it('toggleSkipDuplicate toggles a row index in skippedDuplicates', async () => {
    const { result } = renderHook(() => useImport());

    act(() => {
      result.current.toggleSkipDuplicate(0);
    });

    expect(result.current.skippedDuplicates.has(0)).toBe(true);

    act(() => {
      result.current.toggleSkipDuplicate(0);
    });

    expect(result.current.skippedDuplicates.has(0)).toBe(false);
  });
});
