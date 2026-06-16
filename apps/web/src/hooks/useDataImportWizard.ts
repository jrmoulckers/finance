// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the desktop data import wizard.
 *
 * Handles real CSV, OFX/QFX, and QIF files, normalises them into the wizard's
 * transaction preview shape, performs duplicate checks against existing local
 * transactions, and commits accepted rows through the transaction repository.
 */

import { useCallback, useMemo, useState } from 'react';

import type { CreateTransactionInput } from '../db/repositories/transactions';
import { parseCsv as parseDelimitedCsv } from '../lib/csv-parser';
import { parseCurrencyToCents, parseDate as parseTransactionDate } from '../lib/import/csv-parser';
import {
  parseImportFile,
  type ImportFormat as UniversalImportFormat,
  type NormalisedTransaction,
} from '../lib/import/format-detector';
import { useTransactions } from './useTransactions';

export type ImportWizardStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export type DetectedFormat =
  | 'mint'
  | 'ynab'
  | 'chase'
  | 'amex'
  | 'wellsfargo'
  | 'citi'
  | 'generic'
  | 'csv'
  | 'ofx'
  | 'qfx'
  | 'qif'
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
  | 'merchantCity'
  | 'merchantState'
  | 'merchantZip'
  | 'merchantCountry'
  | 'externalReferenceId'
  | 'statementDescription'
  | 'customFields'
  | 'extraNotes'
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

export interface UnmappedField {
  readonly columnIndex: number;
  readonly columnName: string;
  readonly sampleValue: string;
}

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
  step: ImportWizardStep;
  detectedFormat: DetectedFormat;
  detectedFormatLabel: string;
  csvColumns: CsvColumn[];
  csvRows: string[][];
  columnMappings: ColumnMapping[];
  previewRows: ImportPreviewRow[];
  unmappedFields: UnmappedField[];
  duplicateComparisons: DuplicateComparison[];
  duplicateActions: Record<number, DuplicateAction>;
  progress: ImportProgress | null;
  result: ImportResult | null;
  error: string | null;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  selectedHouseholdId: string | null;
  setSelectedHouseholdId: (id: string | null) => void;
  uploadFile: (file: File) => Promise<void>;
  setColumnMapping: (columnIndex: number, field: TransactionField) => void;
  updatePreviewField: (rowIndex: number, field: string, value: string) => void;
  setDuplicateAction: (rowIndex: number, action: DuplicateAction) => void;
  mapUnmappedToNotes: () => void;
  goToPreview: () => void;
  startImport: () => Promise<void>;
  goBack: () => void;
  reset: () => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['csv', 'txt', 'ofx', 'qfx', 'qif']);
const NORMALISED_IMPORT_HEADERS = [
  'Date',
  'Payee',
  'Amount',
  'Category',
  'Note',
  'Type',
  'External Reference ID',
  'Check Number',
] as const;

export interface WizardCsvParseOptions {
  readonly hasHeader?: boolean;
}

export function parseCsv(
  text: string,
  options: WizardCsvParseOptions = {},
): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^\uFEFF/, '');
  const allRows = parseDelimitedCsv(cleaned, { hasHeader: false }).rows;

  if (allRows.length === 0) return { headers: [], rows: [] };

  const hasHeader = options.hasHeader ?? looksLikeHeaderRow(allRows[0] ?? [], allRows.slice(1, 4));
  if (hasHeader) {
    const { headers, rows } = parseDelimitedCsv(cleaned, { hasHeader: true });
    return { headers, rows: padRows(rows, headers.length) };
  }

  const maxColumns = Math.max(...allRows.map((row) => row.length));
  const headers = Array.from({ length: maxColumns }, (_, index) => `Column ${index + 1}`);
  return { headers, rows: padRows(allRows, maxColumns) };
}

function looksLikeHeaderRow(firstRow: readonly string[], sampleRows: readonly string[][]): boolean {
  if (firstRow.length === 0) return false;

  const knownHeaders = new Set([
    'date',
    'transaction date',
    'posted date',
    'post date',
    'payee',
    'description',
    'name',
    'memo',
    'amount',
    'debit',
    'credit',
    'outflow',
    'inflow',
    'category',
    'account',
    'type',
    'fitid',
    'external reference id',
    'transaction id',
  ]);

  if (firstRow.map(normalizeHeader).some((value) => knownHeaders.has(value))) return true;
  if (firstRow.some(isDateLike) && firstRow.some(isAmountLike)) return false;

  const sample = sampleRows.find((row) => row.some((value) => value.trim().length > 0));
  if (!sample) return true;
  return sample.some(isDateLike) || sample.some(isAmountLike);
}

function padRows(rows: readonly string[][], length: number): string[][] {
  return rows.map((row) => Array.from({ length }, (_, index) => row[index] ?? ''));
}

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
const AMEX_HEADERS = ['Date', 'Description', 'Amount', 'Extended Details'];
const CHASE_HEADERS = [
  'Transaction Date',
  'Post Date',
  'Description',
  'Category',
  'Type',
  'Amount',
];
const WELLS_FARGO_HEADERS = ['Date', 'Amount', 'Description'];
const CITI_HEADERS = ['Status', 'Date', 'Description', 'Debit', 'Credit'];

export const FORMAT_DISPLAY_LABELS: Record<DetectedFormat, string> = {
  mint: 'Mint export',
  ynab: 'YNAB export',
  chase: 'Chase credit card format',
  amex: 'American Express format',
  wellsfargo: 'Wells Fargo format',
  citi: 'Citi card format',
  generic: 'Generic CSV',
  csv: 'CSV',
  ofx: 'OFX statement',
  qfx: 'QFX/Quicken statement',
  qif: 'QIF/Quicken interchange',
  unknown: 'Unknown format',
};

export function detectFormat(headers: string[]): DetectedFormat {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  const chaseMatch = CHASE_HEADERS.filter((ch) =>
    normalizedHeaders.includes(ch.toLowerCase()),
  ).length;
  if (chaseMatch >= 4) return 'chase';

  const citiMatch = CITI_HEADERS.filter((ch) =>
    normalizedHeaders.includes(ch.toLowerCase()),
  ).length;
  if (citiMatch >= 4) return 'citi';

  if (
    normalizedHeaders.length <= 4 &&
    WELLS_FARGO_HEADERS.every((wh) => normalizedHeaders.includes(wh.toLowerCase()))
  ) {
    return 'wellsfargo';
  }

  const mintMatch = MINT_HEADERS.filter((mh) =>
    normalizedHeaders.includes(mh.toLowerCase()),
  ).length;
  if (mintMatch >= 4) return 'mint';

  const amexMatch = AMEX_HEADERS.filter((ah) =>
    normalizedHeaders.includes(ah.toLowerCase()),
  ).length;
  if (amexMatch >= 3) return 'amex';

  const ynabMatch = YNAB_HEADERS.filter((yh) =>
    normalizedHeaders.includes(yh.toLowerCase()),
  ).length;
  if (ynabMatch >= 4) return 'ynab';

  const hasDate = normalizedHeaders.some((h) => h.includes('date'));
  const hasAmount = normalizedHeaders.some(
    (h) => h.includes('amount') || h.includes('total') || h === 'debit' || h === 'credit',
  );
  if (hasDate && hasAmount) return 'generic';

  return 'unknown';
}

function detectFileFormat(
  fileName: string,
  content: string,
  csvHeaders?: string[],
): DetectedFormat {
  const ext = getFileExtension(fileName);
  const trimmed = content.trimStart();
  const upper = trimmed.toUpperCase();

  if (ext === 'qfx' || upper.includes('INTU.BID') || upper.includes('INTU.USERID')) return 'qfx';
  if (
    ext === 'ofx' ||
    upper.includes('OFXHEADER') ||
    upper.includes('<OFX>') ||
    upper.includes('<OFX ')
  ) {
    return 'ofx';
  }
  if (ext === 'qif' || /^!(TYPE|ACCOUNT|OPTION):/i.test(trimmed)) return 'qif';

  if (csvHeaders && csvHeaders.length > 0) {
    const csvFormat = detectFormat(csvHeaders);
    return csvFormat === 'unknown' ? 'generic' : csvFormat;
  }

  return ALLOWED_EXTENSIONS.has(ext) ? 'generic' : 'unknown';
}

function isStructuredStatementFormat(format: DetectedFormat): format is 'ofx' | 'qfx' | 'qif' {
  return format === 'ofx' || format === 'qfx' || format === 'qif';
}

function autoMapColumns(headers: string[], format: DetectedFormat): ColumnMapping[] {
  const mappings: ColumnMapping[] = headers.map((name, index) => ({
    columnIndex: index,
    columnName: name,
    mappedField: 'skip' as TransactionField,
  }));

  if (isStructuredStatementFormat(format)) {
    return mappings.map((m) => {
      const lower = normalizeHeader(m.columnName);
      if (lower === 'date') return { ...m, mappedField: 'date' as TransactionField };
      if (lower === 'payee') return { ...m, mappedField: 'payee' as TransactionField };
      if (lower === 'amount') return { ...m, mappedField: 'amount' as TransactionField };
      if (lower === 'category') return { ...m, mappedField: 'category' as TransactionField };
      if (lower === 'note') return { ...m, mappedField: 'note' as TransactionField };
      if (lower === 'type') return { ...m, mappedField: 'type' as TransactionField };
      if (lower === 'external reference id') {
        return { ...m, mappedField: 'externalReferenceId' as TransactionField };
      }
      return m;
    });
  }

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
      if (lower === 'outflow' || lower === 'inflow') {
        return { ...m, mappedField: 'amount' as TransactionField };
      }
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
      if (lower === 'debit' || lower === 'credit') {
        return { ...m, mappedField: 'amount' as TransactionField };
      }
      return m;
    });
  }

  return mappings.map((m) => {
    const lower = normalizeHeader(m.columnName);
    if (lower.includes('date')) return { ...m, mappedField: 'date' as TransactionField };
    if (lower.includes('payee') || lower.includes('description') || lower.includes('merchant')) {
      return { ...m, mappedField: 'payee' as TransactionField };
    }
    if (
      lower.includes('amount') ||
      lower.includes('total') ||
      lower === 'debit' ||
      lower === 'credit' ||
      lower === 'outflow' ||
      lower === 'inflow'
    ) {
      return { ...m, mappedField: 'amount' as TransactionField };
    }
    if (lower.includes('category')) return { ...m, mappedField: 'category' as TransactionField };
    if (lower.includes('account')) return { ...m, mappedField: 'account' as TransactionField };
    if (lower.includes('note') || lower.includes('memo')) {
      return { ...m, mappedField: 'note' as TransactionField };
    }
    if (lower.includes('type')) return { ...m, mappedField: 'type' as TransactionField };
    if (lower.includes('reference') || lower.includes('transaction id') || lower === 'fitid') {
      return { ...m, mappedField: 'externalReferenceId' as TransactionField };
    }
    return m;
  });
}

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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  const { transactions: existingTransactions, createTransaction } = useTransactions();
  const detectedFormatLabel = FORMAT_DISPLAY_LABELS[detectedFormat];

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
    const amountCols = columnMappings.filter((m) => m.mappedField === 'amount');
    const categoryCol = columnMappings.find((m) => m.mappedField === 'category');
    const accountCol = columnMappings.find((m) => m.mappedField === 'account');
    const noteCol = columnMappings.find((m) => m.mappedField === 'note');

    return csvRows.slice(0, 500).map((row, rowIndex) => {
      const overrides = fieldOverrides[String(rowIndex)] ?? {};
      const values: Record<string, string> = {};
      for (const mapping of columnMappings) {
        if (mapping.mappedField !== 'skip') {
          values[mapping.mappedField] = mergeMappedValue(
            values[mapping.mappedField],
            row[mapping.columnIndex] ?? '',
            mapping.mappedField,
          );
        }
      }

      const dateRaw = overrides.date ?? (dateCol ? (row[dateCol.columnIndex] ?? null) : null);
      const payeeStr = overrides.payee ?? (payeeCol ? (row[payeeCol.columnIndex] ?? null) : null);
      const amountResolution = resolveAmount(row, amountCols);
      const amountStr = overrides.amount ?? amountResolution.value;
      const categoryStr =
        overrides.category ?? (categoryCol ? (row[categoryCol.columnIndex] ?? null) : null);
      const accountStr =
        overrides.account ?? (accountCol ? (row[accountCol.columnIndex] ?? null) : null);
      const noteStr = overrides.note ?? (noteCol ? (row[noteCol.columnIndex] ?? null) : null);

      let amountCents: number | null = null;
      let parsedDate: string | null = null;
      const fieldErrors: Record<string, string> = {};
      let hasError = false;

      if (amountStr) {
        amountCents = parseAmountForColumn(amountStr, amountResolution.columnName);
        if (amountCents === null) {
          hasError = true;
          fieldErrors.amount = `Invalid amount: "${amountStr}"`;
        }
      } else {
        hasError = true;
        fieldErrors.amount = 'Missing amount';
      }

      if (dateRaw) {
        parsedDate = parseTransactionDate(dateRaw.trim());
        if (!parsedDate) {
          hasError = true;
          fieldErrors.date = `Invalid date: "${dateRaw}"`;
        }
      } else {
        hasError = true;
        fieldErrors.date = 'Missing date';
      }

      const isDuplicate =
        parsedDate !== null && amountCents !== null
          ? checkDuplicate(parsedDate, payeeStr ?? '', amountCents, existingTransactions)
          : false;

      const errorMessage = Object.values(fieldErrors).join('; ') || null;

      return {
        rowIndex,
        values,
        parsed: {
          date: parsedDate ?? dateRaw,
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
  }, [csvRows, columnMappings, existingTransactions, fieldOverrides]);

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
    setResult(null);
    setProgress(null);
    setFieldOverrides({});
    setDuplicateActions({});

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError('File is too large. Maximum size is 10 MB.');
      return;
    }

    try {
      const text = await file.text();
      if (text.trim().length === 0) {
        setError('The file is empty.');
        return;
      }

      const fileFormat = detectFileFormat(file.name, text);
      if (fileFormat === 'unknown') {
        setError('Unsupported file type. Please choose a CSV, OFX, QFX, or QIF file.');
        return;
      }

      if (isStructuredStatementFormat(fileFormat)) {
        const parsed = parseImportFile(file.name, text);
        const detected = parsed.format === 'unknown' ? fileFormat : toDetectedFormat(parsed.format);

        if (parsed.transactions.length === 0) {
          setError(buildParserError('No transactions were found in the file.', parsed.errors));
          return;
        }

        const { headers, rows } = normaliseTransactionsForWizard(parsed.transactions);
        setCsvColumns(buildColumns(headers, rows));
        setCsvRows(rows);
        setDetectedFormat(detected);
        setColumnMappings(autoMapColumns(headers, detected));
        setStep('mapping');

        if (parsed.errors.length > 0) {
          setError(buildParserError('Some records could not be parsed.', parsed.errors));
        }
        return;
      }

      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) {
        setError('The CSV file appears to be empty or has no columns.');
        return;
      }
      if (rows.length === 0) {
        setError('The CSV file has no data rows.');
        return;
      }

      const csvFormat = detectFileFormat(file.name, text, headers);
      setCsvColumns(buildColumns(headers, rows));
      setCsvRows(rows);
      setDetectedFormat(csvFormat);
      setColumnMappings(autoMapColumns(headers, csvFormat));
      setStep('mapping');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse the import file.');
    }
  }, []);

  const setColumnMapping = useCallback((columnIndex: number, field: TransactionField) => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.columnIndex === columnIndex ? { ...m, mappedField: field } : m)),
    );
  }, []);

  const updatePreviewField = useCallback((rowIndex: number, field: string, value: string) => {
    setFieldOverrides((prev) => ({
      ...prev,
      [String(rowIndex)]: {
        ...(prev[String(rowIndex)] ?? {}),
        [field]: value,
      },
    }));
  }, []);

  const setDuplicateAction = useCallback((rowIndex: number, action: DuplicateAction) => {
    setDuplicateActions((prev) => ({ ...prev, [rowIndex]: action }));
  }, []);

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
    if (selectedAccountId === null) {
      setError('Please select the account to import these transactions into.');
      return;
    }

    setError(null);
    setStep('preview');
  }, [columnMappings, selectedAccountId]);

  const startImport = useCallback(async () => {
    if (selectedAccountId === null) {
      setError('Please select the account to import these transactions into.');
      return;
    }

    setStep('importing');
    setError(null);

    const rowErrorCount = previewRows.filter((r) => r.hasError).length;
    const duplicatesSkipped = previewRows.filter(
      (r) => r.isDuplicate && (duplicateActions[r.rowIndex] ?? 'skip') === 'skip',
    ).length;
    const rowsToImport = previewRows.filter(
      (r) => !r.hasError && (!r.isDuplicate || (duplicateActions[r.rowIndex] ?? 'skip') !== 'skip'),
    );
    const total = rowsToImport.length;
    let imported = 0;
    let importErrors = 0;

    setProgress({
      current: 0,
      total,
      duplicatesSkipped,
      errorsCount: rowErrorCount,
      percentComplete: total === 0 ? 100 : 0,
    });

    for (const row of rowsToImport) {
      const input = buildCreateTransactionInput(row, selectedAccountId, selectedHouseholdId ?? '');
      if (input === null) {
        importErrors++;
      } else {
        const created = createTransaction(input);
        if (created !== null) imported++;
        else importErrors++;
      }

      const processed = imported + importErrors;
      setProgress({
        current: processed,
        total,
        duplicatesSkipped,
        errorsCount: rowErrorCount + importErrors,
        percentComplete: total === 0 ? 100 : Math.round((processed / total) * 100),
      });
      await Promise.resolve();
    }

    setResult({
      imported,
      duplicatesSkipped,
      errors: rowErrorCount + importErrors,
      totalProcessed: previewRows.length,
    });
    setStep('complete');
  }, [createTransaction, duplicateActions, previewRows, selectedAccountId, selectedHouseholdId]);

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
    selectedAccountId,
    setSelectedAccountId,
    selectedHouseholdId,
    setSelectedHouseholdId,
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

function buildColumns(headers: readonly string[], rows: readonly string[][]): CsvColumn[] {
  return headers.map((name, index) => ({
    index,
    name,
    sampleValues: rows.slice(0, 3).map((r) => r[index] ?? ''),
  }));
}

function normaliseTransactionsForWizard(transactions: readonly NormalisedTransaction[]): {
  headers: string[];
  rows: string[][];
} {
  return {
    headers: [...NORMALISED_IMPORT_HEADERS],
    rows: transactions.map((transaction) => [
      transaction.date,
      transaction.payee,
      transaction.amount,
      transaction.category ?? '',
      transaction.memo ?? '',
      transaction.sourceType ?? transaction.sourceFormat.toUpperCase(),
      transaction.sourceTransactionId ?? '',
      transaction.checkNum ?? '',
    ]),
  };
}

function toDetectedFormat(format: UniversalImportFormat): DetectedFormat {
  if (format === 'ofx' || format === 'qfx' || format === 'qif') return format;
  if (format === 'mint' || format === 'ynab') return format;
  if (format === 'csv') return 'generic';
  return 'unknown';
}

function buildParserError(prefix: string, parserErrors: readonly string[]): string {
  if (parserErrors.length === 0) return prefix;
  return `${prefix} ${parserErrors.slice(0, 3).join(' ')}`;
}

function mergeMappedValue(
  existing: string | undefined,
  next: string,
  field: TransactionField,
): string {
  if (field !== 'note') return next;
  if (!existing) return next;
  if (!next) return existing;
  return `${existing}; ${next}`;
}

function resolveAmount(
  row: readonly string[],
  amountCols: readonly ColumnMapping[],
): { value: string | null; columnName: string | null } {
  for (const column of amountCols) {
    const value = row[column.columnIndex]?.trim();
    if (value) return { value, columnName: column.columnName };
  }
  return { value: null, columnName: amountCols[0]?.columnName ?? null };
}

function parseAmountForColumn(raw: string, columnName: string | null): number | null {
  const cents = parseCurrencyToCents(raw);
  if (cents === null) return null;

  const normalizedColumn = normalizeHeader(columnName ?? '');
  if (
    cents > 0 &&
    (normalizedColumn === 'debit' ||
      normalizedColumn === 'outflow' ||
      normalizedColumn.includes('withdrawal'))
  ) {
    return -cents;
  }
  if (cents < 0 && (normalizedColumn === 'credit' || normalizedColumn === 'inflow')) {
    return Math.abs(cents);
  }
  return cents;
}

function checkDuplicate(
  date: string,
  payee: string,
  amountCents: number,
  existingTransactions: readonly {
    date: string;
    payee?: string | null;
    amount: { amount: number };
  }[],
): boolean {
  const target = duplicateKey(date, payee, amountCents);
  return existingTransactions.some(
    (transaction) =>
      target === duplicateKey(transaction.date, transaction.payee ?? '', transaction.amount.amount),
  );
}

function duplicateKey(date: string, payee: string, amountCents: number): string {
  return `${date}|${Math.abs(amountCents)}|${payee.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

function buildCreateTransactionInput(
  row: ImportPreviewRow,
  accountId: string,
  householdId: string,
): CreateTransactionInput | null {
  if (!row.parsed.date || row.parsed.amountCents === null) return null;

  const type =
    normalizeTransactionType(row.values.type) ??
    (row.parsed.amountCents < 0 ? 'EXPENSE' : 'INCOME');
  const payee =
    row.parsed.payee?.trim() || row.values.description?.trim() || 'Imported transaction';
  const note = row.parsed.note?.trim() || null;

  const input: CreateTransactionInput = {
    householdId,
    accountId,
    type: type as CreateTransactionInput['type'],
    status: 'CLEARED',
    amount: { amount: Math.abs(row.parsed.amountCents) },
    date: row.parsed.date as CreateTransactionInput['date'],
    payee,
    note,
  };

  if (row.parsed.category?.trim()) input.categoryId = row.parsed.category.trim();
  if (row.values.externalReferenceId?.trim()) {
    input.externalReferenceId = row.values.externalReferenceId.trim();
  }
  if (row.values.statementDescription?.trim()) {
    input.statementDescription = row.values.statementDescription.trim();
  }
  if (row.values.extraNotes?.trim()) input.extraNotes = row.values.extraNotes.trim();
  if (row.values.merchantCity?.trim()) input.merchantCity = row.values.merchantCity.trim();
  if (row.values.merchantState?.trim()) input.merchantState = row.values.merchantState.trim();
  if (row.values.merchantZip?.trim()) input.merchantZip = row.values.merchantZip.trim();
  if (row.values.merchantCountry?.trim()) input.merchantCountry = row.values.merchantCountry.trim();

  return input;
}

function normalizeTransactionType(
  value: string | undefined,
): 'EXPENSE' | 'INCOME' | 'TRANSFER' | null {
  const upper = value?.trim().toUpperCase();
  if (upper === 'EXPENSE' || upper === 'DEBIT' || upper === 'CHECK' || upper === 'PAYMENT') {
    return 'EXPENSE';
  }
  if (upper === 'INCOME' || upper === 'CREDIT' || upper === 'DEP' || upper === 'DIRECTDEP') {
    return 'INCOME';
  }
  if (upper === 'TRANSFER' || upper === 'XFER') return 'TRANSFER';
  return null;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isDateLike(value: string): boolean {
  return parseTransactionDate(value.trim()) !== null || /^\d{8}(\d{6})?/.test(value.trim());
}

function isAmountLike(value: string): boolean {
  return parseCurrencyToCents(value.trim()) !== null;
}

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}
