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

export type DetectedFormat = 'mint' | 'ynab' | 'generic' | 'unknown';

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
  };
  readonly isDuplicate: boolean;
  readonly hasError: boolean;
  readonly errorMessage: string | null;
}

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
  /** Raw CSV data after parsing. */
  csvColumns: CsvColumn[];
  /** Raw CSV rows. */
  csvRows: string[][];
  /** Column mapping configuration. */
  columnMappings: ColumnMapping[];
  /** Preview rows with parsed data and duplicate detection. */
  previewRows: ImportPreviewRow[];
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

export function detectFormat(headers: string[]): DetectedFormat {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  // Check for Mint format
  const mintMatch = MINT_HEADERS.filter((mh) =>
    normalizedHeaders.includes(mh.toLowerCase()),
  ).length;
  if (mintMatch >= 4) return 'mint';

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

  // Simulated existing transaction hashes for duplicate detection
  const existingHashes = useMemo(() => new Set<string>(), []);

  const previewRows = useMemo((): ImportPreviewRow[] => {
    if (csvRows.length === 0 || columnMappings.length === 0) return [];

    const dateCol = columnMappings.find((m) => m.mappedField === 'date');
    const payeeCol = columnMappings.find((m) => m.mappedField === 'payee');
    const amountCol = columnMappings.find((m) => m.mappedField === 'amount');
    const categoryCol = columnMappings.find((m) => m.mappedField === 'category');

    return csvRows.slice(0, 50).map((row, rowIndex) => {
      const values: Record<string, string> = {};
      for (const mapping of columnMappings) {
        if (mapping.mappedField !== 'skip') {
          values[mapping.mappedField] = row[mapping.columnIndex] ?? '';
        }
      }

      const dateStr = dateCol ? (row[dateCol.columnIndex] ?? null) : null;
      const payeeStr = payeeCol ? (row[payeeCol.columnIndex] ?? null) : null;
      const amountStr = amountCol ? (row[amountCol.columnIndex] ?? null) : null;
      const categoryStr = categoryCol ? (row[categoryCol.columnIndex] ?? null) : null;

      let amountCents: number | null = null;
      let hasError = false;
      let errorMessage: string | null = null;

      if (amountStr) {
        const cleaned = amountStr.replace(/[$,]/g, '');
        const parsed = parseFloat(cleaned);
        if (!Number.isNaN(parsed)) {
          amountCents = Math.round(parsed * 100);
        } else {
          hasError = true;
          errorMessage = `Invalid amount: "${amountStr}"`;
        }
      }

      if (!dateStr) {
        hasError = true;
        errorMessage = errorMessage ?? 'Missing date';
      }

      const isDuplicate = checkDuplicate(
        { date: dateStr ?? '', payee: payeeStr ?? '', amount: amountStr ?? '' },
        existingHashes,
      );

      return {
        rowIndex,
        values,
        parsed: {
          date: dateStr,
          payee: payeeStr,
          amountCents,
          category: categoryStr,
        },
        isDuplicate,
        hasError,
        errorMessage,
      };
    });
  }, [csvRows, columnMappings, existingHashes]);

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
  }, []);

  return {
    step,
    detectedFormat,
    csvColumns,
    csvRows,
    columnMappings,
    previewRows,
    progress,
    result,
    error,
    uploadFile,
    setColumnMapping,
    goToPreview,
    startImport,
    goBack,
    reset,
  };
}
