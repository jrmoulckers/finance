// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the data import wizard.
 *
 * Manages CSV upload, column mapping, Mint/YNAB format auto-detection,
 * preview table, duplicate detection, and import progress.
 *
 * Usage:
 * ```tsx
 * const { step, uploadFile, columnMapping, startImport, progress } = useDataImportWizard();
 * ```
 *
 * References: issue #1076
 */

import { useCallback, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportWizardStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export type DetectedFormat =
  | 'mint'
  | 'ynab'
  | 'chase'
  | 'amex'
  | 'wellsfargo'
  | 'citi'
  | 'generic'
  | 'unknown';

export interface CsvColumn {
  readonly index: number;
  readonly name: string;
  readonly sampleValues: string[];
}

export type TransactionField =
  | 'date'
  | 'payee'
  | 'amount'
  | 'category'
  | 'account'
  | 'note'
  | 'type'
  | 'skip';

export interface ColumnMapping {
  readonly columnIndex: number;
  readonly columnName: string;
  readonly mappedField: TransactionField;
}

export interface ImportPreviewRow {
  readonly rowIndex: number;
  readonly values: Record<string, string>;
  readonly parsed: {
    date: string | null;
    payee: string | null;
    amountCents: number | null;
    category: string | null;
    account: string | null;
    note: string | null;
  };
  readonly isDuplicate: boolean;
  readonly hasError: boolean;
  readonly errorMessage: string | null;
  readonly fieldErrors: Record<string, string>;
}

/** Describes a field that was present in CSV but not mapped to any transaction field. */
export interface UnmappedField {
  readonly columnIndex: number;
  readonly columnName: string;
  readonly sampleValue: string;
}

/** Duplicate comparison data for side-by-side review. */
export interface DuplicateComparison {
  readonly rowIndex: number;
  readonly importRow: ImportPreviewRow;
  readonly existingTransaction: {
    date: string;
    payee: string;
    amount: string;
    category: string;
  };
  readonly differences: string[];
}

/** Resolution action for a duplicate row. */
export type DuplicateAction = 'skip' | 'import' | 'replace';

export interface ImportProgress {
  readonly current: number;
  readonly total: number;
  readonly duplicatesSkipped: number;
  readonly errorsCount: number;
  readonly percentComplete: number;
}

export interface ImportResult {
  readonly imported: number;
  readonly duplicatesSkipped: number;
  readonly errors: number;
  readonly totalProcessed: number;
}

export interface UseDataImportWizardResult {
  /** Current wizard step. */
  step: ImportWizardStep;
  /** The detected file format. */
  detectedFormat: DetectedFormat;
  /** Human-readable label for the detected format. */
  detectedFormatLabel: string;
  /** Raw CSV data after parsing. */
  csvColumns: CsvColumn[];
  /** Raw CSV rows. */
  csvRows: string[][];
  /** Column mapping configuration. */
  columnMappings: ColumnMapping[];
  /** Preview rows with parsed data and duplicate detection. */
  previewRows: ImportPreviewRow[];
  /** Fields present in CSV but not mapped to any transaction field. */
  unmappedFields: UnmappedField[];
  /** Duplicate comparison data for side-by-side review. */
  duplicateComparisons: DuplicateComparison[];
  /** Resolution actions for duplicate rows (rowIndex -> action). */
  duplicateActions: Record<number, DuplicateAction>;
  /** Import progress (during import step). */
  progress: ImportProgress | null;
  /** Final import result. */
  result: ImportResult | null;
  /** Error message, or null. */
  error: string | null;
  /** Upload and parse a CSV file. */
  uploadFile: (file: File) => Promise<void>;
  /** Update a column mapping. */
  setColumnMapping: (columnIndex: number, field: TransactionField) => void;
  /** Update a parsed field value for inline correction. */
  updatePreviewField: (rowIndex: number, field: string, value: string) => void;
  /** Set the resolution action for a duplicate row. */
  setDuplicateAction: (rowIndex: number, action: DuplicateAction) => void;
  /** Map all unmapped fields to Notes. */
  mapUnmappedToNotes: () => void;
  /** Move to the preview step. */
  goToPreview: () => void;
  /** Start the import process. */
  startImport: () => Promise<void>;
  /** Go back one step. */
  goBack: () => void;
  /** Reset the wizard. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i]!;
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]!);
  const rows = lines.slice(1).map(parseLine);

  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Format Detection
// ---------------------------------------------------------------------------

const MINT_HEADERS = [
  'Date',
  'Description',
  'Original Description',
  'Amount',
  'Transaction Type',
  'Category',
  'Account Name',
];
const YNAB_HEADERS = ['Date', 'Payee', 'Category', 'Memo', 'Outflow', 'Inflow'];

/** American Express: Date, Description, Amount, Extended Details, etc. */
const AMEX_HEADERS = ['Date', 'Description', 'Amount', 'Extended Details'];

/** Chase: Transaction Date, Post Date, Description, Category, Type, Amount */
const CHASE_HEADERS = [
  'Transaction Date',
  'Post Date',
  'Description',
  'Category',
  'Type',
  'Amount',
];

/** Wells Fargo: simple 3-column Date, Amount, Description */
const WELLS_FARGO_HEADERS = ['Date', 'Amount', 'Description'];

/** Citi: Status, Date, Description, Debit, Credit */
const CITI_HEADERS = ['Status', 'Date', 'Description', 'Debit', 'Credit'];

/** Human-readable labels for detected formats. */
export const FORMAT_DISPLAY_LABELS: Record<DetectedFormat, string> = {
  mint: 'Mint export',
  ynab: 'YNAB export',
  chase: 'Chase credit card format',
  amex: 'American Express format',
  wellsfargo: 'Wells Fargo format',
  citi: 'Citi card format',
  generic: 'Generic CSV',
  unknown: 'Unknown format',
};

export function detectFormat(headers: string[]): DetectedFormat {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  // Check for Chase format first (has distinctive "Transaction Date" + "Post Date")
  const chaseMatch = CHASE_HEADERS.filter((ch) =>
    normalizedHeaders.includes(ch.toLowerCase()),
  ).length;
  if (chaseMatch >= 4) return 'chase';

  // Check for Citi format (distinctive "Status", "Debit", "Credit" columns)
  const citiMatch = CITI_HEADERS.filter((ch) =>
    normalizedHeaders.includes(ch.toLowerCase()),
  ).length;
  if (citiMatch >= 4) return 'citi';

  // Check for Wells Fargo (simple 3-column: Date, Amount, Description) — check before Amex
  // since WF's columns are a subset of Amex columns
  if (
    normalizedHeaders.length <= 4 &&
    WELLS_FARGO_HEADERS.every((wh) => normalizedHeaders.includes(wh.toLowerCase()))
  ) {
    return 'wellsfargo';
  }

  // Check for Mint format
  const mintMatch = MINT_HEADERS.filter((mh) =>
    normalizedHeaders.includes(mh.toLowerCase()),
  ).length;
  if (mintMatch >= 4) return 'mint';

  // Check for American Express (has "Extended Details")
  const amexMatch = AMEX_HEADERS.filter((ah) =>
    normalizedHeaders.includes(ah.toLowerCase()),
  ).length;
  if (amexMatch >= 3) return 'amex';

  // Check for YNAB format
  const ynabMatch = YNAB_HEADERS.filter((yh) =>
    normalizedHeaders.includes(yh.toLowerCase()),
  ).length;
  if (ynabMatch >= 4) return 'ynab';

  // Check for generic transaction format
  const hasDate = normalizedHeaders.some((h) => h.includes('date'));
  const hasAmount = normalizedHeaders.some((h) => h.includes('amount') || h.includes('total'));
  if (hasDate && hasAmount) return 'generic';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Auto-mapping
// ---------------------------------------------------------------------------

function autoMapColumns(headers: string[], format: DetectedFormat): ColumnMapping[] {
  const mappings: ColumnMapping[] = headers.map((name, index) => ({
    columnIndex: index,
    columnName: name,
    mappedField: 'skip' as TransactionField,
  }));

  if (format === 'mint') {
    return mappings.map((m) => {
      const lower = m.columnName.toLowerCase();
      if (lower === 'date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'description') return { ...m, mappedField: 'payee' as TransactionField };
      if (lower === 'amount') return { ...m, mappedField: 'amount' as TransactionField };
      if (lower === 'category') return { ...m, mappedField: 'category' as TransactionField };
      if (lower === 'account name') return { ...m, mappedField: 'account' as TransactionField };
      if (lower === 'notes') return { ...m, mappedField: 'note' as TransactionField };
      if (lower === 'transaction type') return { ...m, mappedField: 'type' as TransactionField };
      return m;
    });
  }

  if (format === 'ynab') {
    return mappings.map((m) => {
      const lower = m.columnName.toLowerCase();
      if (lower === 'date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'payee') return { ...m, mappedField: 'payee' as TransactionField };
      if (lower === 'category') return { ...m, mappedField: 'category' as TransactionField };
      if (lower === 'memo') return { ...m, mappedField: 'note' as TransactionField };
      if (lower === 'outflow' || lower === 'inflow')
        return { ...m, mappedField: 'amount' as TransactionField };
      return m;
    });
  }

  if (format === 'chase') {
    return mappings.map((m) => {
      const lower = m.columnName.toLowerCase();
      if (lower === 'transaction date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'description') return { ...m, mappedField: 'payee' as TransactionField };
      if (lower === 'amount') return { ...m, mappedField: 'amount' as TransactionField };
      if (lower === 'category') return { ...m, mappedField: 'category' as TransactionField };
      if (lower === 'type') return { ...m, mappedField: 'type' as TransactionField };
      return m;
    });
  }

  if (format === 'amex') {
    return mappings.map((m) => {
      const lower = m.columnName.toLowerCase();
      if (lower === 'date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'description') return { ...m, mappedField: 'payee' as TransactionField };
      if (lower === 'amount') return { ...m, mappedField: 'amount' as TransactionField };
      if (lower === 'extended details') return { ...m, mappedField: 'note' as TransactionField };
      return m;
    });
  }

  if (format === 'wellsfargo') {
    return mappings.map((m) => {
      const lower = m.columnName.toLowerCase();
      if (lower === 'date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'amount') return { ...m, mappedField: 'amount' as TransactionField };
      if (lower === 'description') return { ...m, mappedField: 'payee' as TransactionField };
      return m;
    });
  }

  if (format === 'citi') {
    return mappings.map((m) => {
      const lower = m.columnName.toLowerCase();
      if (lower === 'date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'description') return { ...m, mappedField: 'payee' as TransactionField };
      if (lower === 'debit' || lower === 'credit')
        return { ...m, mappedField: 'amount' as TransactionField };
      return m;
    });
  }

  // Generic auto-detection
  return mappings.map((m) => {
    const lower = m.columnName.toLowerCase();
    if (lower.includes('date')) return { ...m, mappedField: 'date' as TransactionField };
    if (lower.includes('payee') || lower.includes('description') || lower.includes('merchant'))
      return { ...m, mappedField: 'payee' as TransactionField };
    if (lower.includes('amount') || lower.includes('total'))
      return { ...m, mappedField: 'amount' as TransactionField };
    if (lower.includes('category')) return { ...m, mappedField: 'category' as TransactionField };
    if (lower.includes('account')) return { ...m, mappedField: 'account' as TransactionField };
    if (lower.includes('note') || lower.includes('memo'))
      return { ...m, mappedField: 'note' as TransactionField };
    return m;
  });
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

function checkDuplicate(row: Record<string, string>, existingHashes: Set<string>): boolean {
  const hash = [row.date, row.payee, row.amount].filter(Boolean).join('|').toLowerCase();
  return existingHashes.has(hash);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDataImportWizard(): UseDataImportWizardResult {
  const [step, setStep] = useState<ImportWizardStep>('upload');
  const [detectedFormat, setDetectedFormat] = useState<DetectedFormat>('unknown');
  const [csvColumns, setCsvColumns] = useState<CsvColumn[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, Record<string, string>>>({});
  const [duplicateActions, setDuplicateActions] = useState<Record<number, DuplicateAction>>({});

  // Simulated existing transaction hashes for duplicate detection
  const existingHashes = useMemo(() => new Set<string>(), []);

  /** Human-readable label for the detected format. */
  const detectedFormatLabel = FORMAT_DISPLAY_LABELS[detectedFormat];

  /** Fields present in CSV but not mapped to any transaction field. */
  const unmappedFields = useMemo((): UnmappedField[] => {
    return columnMappings
      .filter((m) => m.mappedField === 'skip')
      .map((m) => ({
        columnIndex: m.columnIndex,
        columnName: m.columnName,
        sampleValue: csvRows[0]?.[m.columnIndex] ?? '',
      }));
  }, [columnMappings, csvRows]);

  const previewRows = useMemo((): ImportPreviewRow[] => {
    if (csvRows.length === 0 || columnMappings.length === 0) return [];

    const dateCol = columnMappings.find((m) => m.mappedField === 'date');
    const payeeCol = columnMappings.find((m) => m.mappedField === 'payee');
    const amountCol = columnMappings.find((m) => m.mappedField === 'amount');
    const categoryCol = columnMappings.find((m) => m.mappedField === 'category');
    const accountCol = columnMappings.find((m) => m.mappedField === 'account');
    const noteCol = columnMappings.find((m) => m.mappedField === 'note');

    return csvRows.slice(0, 50).map((row, rowIndex) => {
      const overrides = fieldOverrides[String(rowIndex)] ?? {};
      const values: Record<string, string> = {};
      for (const mapping of columnMappings) {
        if (mapping.mappedField !== 'skip') {
          values[mapping.mappedField] = row[mapping.columnIndex] ?? '';
        }
      }

      const dateStr = overrides.date ?? (dateCol ? (row[dateCol.columnIndex] ?? null) : null);
      const payeeStr = overrides.payee ?? (payeeCol ? (row[payeeCol.columnIndex] ?? null) : null);
      const amountStr =
        overrides.amount ?? (amountCol ? (row[amountCol.columnIndex] ?? null) : null);
      const categoryStr =
        overrides.category ?? (categoryCol ? (row[categoryCol.columnIndex] ?? null) : null);
      const accountStr =
        overrides.account ?? (accountCol ? (row[accountCol.columnIndex] ?? null) : null);
      const noteStr = overrides.note ?? (noteCol ? (row[noteCol.columnIndex] ?? null) : null);

      let amountCents: number | null = null;
      const fieldErrors: Record<string, string> = {};
      let hasError = false;

      if (amountStr) {
        const cleaned = amountStr.replace(/[$,]/g, '');
        const parsed = parseFloat(cleaned);
        if (!Number.isNaN(parsed)) {
          amountCents = Math.round(parsed * 100);
        } else {
          hasError = true;
          fieldErrors.amount = `Invalid amount: "${amountStr}"`;
        }
      }

      if (!dateStr) {
        hasError = true;
        fieldErrors.date = 'Missing date';
      }

      const isDuplicate = checkDuplicate(
        { date: dateStr ?? '', payee: payeeStr ?? '', amount: amountStr ?? '' },
        existingHashes,
      );

      const errorMessage = Object.values(fieldErrors).join('; ') || null;

      return {
        rowIndex,
        values,
        parsed: {
          date: dateStr,
          payee: payeeStr,
          amountCents,
          category: categoryStr,
          account: accountStr,
          note: noteStr,
        },
        isDuplicate,
        hasError,
        errorMessage,
        fieldErrors,
      };
    });
  }, [csvRows, columnMappings, existingHashes, fieldOverrides]);

  /** Duplicate comparisons for side-by-side review. */
  const duplicateComparisons = useMemo((): DuplicateComparison[] => {
    return previewRows
      .filter((r) => r.isDuplicate)
      .map((row) => ({
        rowIndex: row.rowIndex,
        importRow: row,
        existingTransaction: {
          date: row.parsed.date ?? '',
          payee: row.parsed.payee ?? '',
          amount:
            row.parsed.amountCents != null ? `$${(row.parsed.amountCents / 100).toFixed(2)}` : '—',
          category: row.parsed.category ?? 'Uncategorized',
        },
        differences: [],
      }));
  }, [previewRows]);

  const uploadFile = useCallback(async (file: File) => {
    setError(null);

    try {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);

      if (headers.length === 0) {
        setError('The file appears to be empty or has no header row.');
        return;
      }

      const columns: CsvColumn[] = headers.map((name, index) => ({
        index,
        name,
        sampleValues: rows.slice(0, 3).map((r) => r[index] ?? ''),
      }));

      const format = detectFormat(headers);
      const mappings = autoMapColumns(headers, format);

      setCsvColumns(columns);
      setCsvRows(rows);
      setDetectedFormat(format);
      setColumnMappings(mappings);
      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV file.');
    }
  }, []);

  const setColumnMapping = useCallback((columnIndex: number, field: TransactionField) => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.columnIndex === columnIndex ? { ...m, mappedField: field } : m)),
    );
  }, []);

  /** Update a parsed field value for inline correction in the preview step. */
  const updatePreviewField = useCallback((rowIndex: number, field: string, value: string) => {
    setFieldOverrides((prev) => ({
      ...prev,
      [String(rowIndex)]: {
        ...(prev[String(rowIndex)] ?? {}),
        [field]: value,
      },
    }));
  }, []);

  /** Set the resolution action for a duplicate row. */
  const setDuplicateAction = useCallback((rowIndex: number, action: DuplicateAction) => {
    setDuplicateActions((prev) => ({ ...prev, [rowIndex]: action }));
  }, []);

  /** Map all unmapped (skipped) fields to Notes. */
  const mapUnmappedToNotes = useCallback(() => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.mappedField === 'skip' ? { ...m, mappedField: 'note' } : m)),
    );
  }, []);

  const goToPreview = useCallback(() => {
    const hasDate = columnMappings.some((m) => m.mappedField === 'date');
    const hasAmount = columnMappings.some((m) => m.mappedField === 'amount');

    if (!hasDate || !hasAmount) {
      setError('Please map at least Date and Amount columns.');
      return;
    }

    setError(null);
    setStep('preview');
  }, [columnMappings]);

  const startImport = useCallback(async () => {
    setStep('importing');
    setError(null);

    const validRows = previewRows.filter((r) => !r.hasError && !r.isDuplicate);
    const total = validRows.length;
    let imported = 0;
    const errorsCount = 0;
    const duplicatesSkipped = previewRows.filter((r) => r.isDuplicate).length;

    for (let i = 0; i < validRows.length; i++) {
      // Simulate import delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      imported++;
      setProgress({
        current: imported,
        total,
        duplicatesSkipped,
        errorsCount,
        percentComplete: Math.round((imported / total) * 100),
      });
    }

    setResult({
      imported,
      duplicatesSkipped,
      errors: errorsCount,
      totalProcessed: previewRows.length,
    });
    setStep('complete');
  }, [previewRows]);

  const goBack = useCallback(() => {
    setError(null);
    setStep((prev) => {
      if (prev === 'mapping') return 'upload';
      if (prev === 'preview') return 'mapping';
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    setStep('upload');
    setDetectedFormat('unknown');
    setCsvColumns([]);
    setCsvRows([]);
    setColumnMappings([]);
    setProgress(null);
    setResult(null);
    setError(null);
    setFieldOverrides({});
    setDuplicateActions({});
  }, []);

  return {
    step,
    detectedFormat,
    detectedFormatLabel,
    csvColumns,
    csvRows,
    columnMappings,
    previewRows,
    unmappedFields,
    duplicateComparisons,
    duplicateActions,
    progress,
    result,
    error,
    uploadFile,
    setColumnMapping,
    updatePreviewField,
    setDuplicateAction,
    mapUnmappedToNotes,
    goToPreview,
    startImport,
    goBack,
    reset,
  };
}
