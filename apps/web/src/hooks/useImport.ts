// SPDX-License-Identifier: BUSL-1.1

/**
 * CSV Import orchestration hook.
 *
 * Manages a multi-step import wizard:
 *   1. **upload** — read a CSV file and parse it
 *   2. **mapping** — map CSV columns to transaction fields
 *   3. **preview** — validate rows and detect duplicates
 *   4. **importing** — batch-create transactions
 *   5. **complete** — show summary
 *
 * Integrates with the CSV utility modules (`csv-parser`, `csv-column-mapper`,
 * `csv-import-validator`, `csv-duplicate-detector`) and the existing
 * `useTransactions` / `useAccounts` hooks for data access.
 *
 * Usage:
 * ```tsx
 * const importState = useImport();
 * // render UI based on importState.step
 * ```
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { parseCsv, type CsvParseResult } from '../lib/csv-parser';
import {
  applyMapping,
  suggestMappings,
  type ColumnMapping,
  type MappingSuggestion,
} from '../lib/csv-column-mapper';
import { validateImportRows, type ValidationResult } from '../lib/csv-import-validator';
import { detectDuplicates, type DuplicateMatch } from '../lib/csv-duplicate-detector';
import { useTransactions } from './useTransactions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The steps of the import wizard, in order. */
export type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

/** Progress during batch import. */
export interface ImportProgress {
  current: number;
  total: number;
}

/** Summary shown on the complete step. */
export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: number;
}

/** Full return type of {@link useImport}. */
export interface UseImportResult {
  step: ImportStep;

  // Upload step
  file: File | null;
  parseResult: CsvParseResult | null;
  uploadFile: (file: File) => void;
  uploadError: string | null;

  // Mapping step
  mappingSuggestions: MappingSuggestion[];
  columnMapping: ColumnMapping;
  setColumnMapping: (mapping: ColumnMapping) => void;
  confirmMapping: () => void;

  // Preview step
  validationResult: ValidationResult | null;
  duplicates: DuplicateMatch[];
  skippedDuplicates: Set<number>;
  toggleSkipDuplicate: (rowIndex: number) => void;
  skipAllDuplicates: () => void;

  // Import step
  importProgress: ImportProgress;
  startImport: () => void;

  // Complete step
  importSummary: ImportSummary | null;

  // Navigation
  goBack: () => void;
  reset: () => void;

  // Account & household selection
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string) => void;
  selectedHouseholdId: string | null;
  setSelectedHouseholdId: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.csv'];
const IMPORT_BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Helper: read File as text
// ---------------------------------------------------------------------------

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates CSV import through a multi-step wizard.
 *
 * All heavy lifting (parsing, mapping, validation, duplicate detection)
 * is delegated to the CSV utility modules.  The hook manages state
 * transitions and wires everything together.
 */
export function useImport(): UseImportResult {
  // Step state
  const [step, setStep] = useState<ImportStep>('upload');

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Mapping state
  const [mappingSuggestions, setMappingSuggestions] = useState<MappingSuggestion[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});

  // Preview state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [skippedDuplicates, setSkippedDuplicates] = useState<Set<number>>(new Set());

  // Import state
  const [importProgress, setImportProgress] = useState<ImportProgress>({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  // Account / household selection
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);

  // Existing transactions for duplicate detection
  const { transactions: existingTransactions, createTransaction } = useTransactions();

  // Guard against concurrent imports
  const importingRef = useRef(false);

  // -------------------------------------------------------------------------
  // Upload step
  // -------------------------------------------------------------------------

  const uploadFile = useCallback((incoming: File) => {
    setUploadError(null);

    // Validate file extension
    const fileName = incoming.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));
    if (!hasValidExtension) {
      setUploadError('Please select a .csv file.');
      return;
    }

    // Validate file size
    if (incoming.size > MAX_FILE_SIZE_BYTES) {
      setUploadError('File is too large. Maximum size is 10 MB.');
      return;
    }

    if (incoming.size === 0) {
      setUploadError('File is empty.');
      return;
    }

    // Read and parse
    void readFileAsText(incoming)
      .then((text) => {
        const result = parseCsv(text);

        if (result.headers.length === 0) {
          setUploadError('CSV file has no columns. Please check the file format.');
          return;
        }

        if (result.rows.length === 0) {
          setUploadError('CSV file has no data rows.');
          return;
        }

        setFile(incoming);
        setParseResult(result);

        // Generate mapping suggestions
        const suggestions = suggestMappings(result.headers);
        setMappingSuggestions(suggestions);

        // Auto-populate column mapping from high-confidence suggestions
        const autoMapping: ColumnMapping = {};
        for (const suggestion of suggestions) {
          if (suggestion.confidence >= 0.5) {
            autoMapping[suggestion.columnIndex] = suggestion.suggestedField;
          }
        }
        setColumnMapping(autoMapping);

        // Move to mapping step
        setStep('mapping');
      })
      .catch(() => {
        setUploadError('Failed to read the file. Please try again.');
      });
  }, []);

  // -------------------------------------------------------------------------
  // Mapping step
  // -------------------------------------------------------------------------

  const confirmMapping = useCallback(() => {
    if (parseResult === null || selectedAccountId === null) {
      return;
    }

    const householdId = selectedHouseholdId ?? '';

    // Apply mapping to produce raw import rows
    const rawRows = applyMapping(parseResult.rows, columnMapping, parseResult.headers);

    // Validate mapped rows
    const validation = validateImportRows(rawRows, selectedAccountId, householdId);
    setValidationResult(validation);

    // Detect duplicates against existing transactions
    const dupes = detectDuplicates(validation.valid, existingTransactions);
    setDuplicates(dupes);
    setSkippedDuplicates(new Set());

    setStep('preview');
  }, [parseResult, columnMapping, selectedAccountId, selectedHouseholdId, existingTransactions]);

  // -------------------------------------------------------------------------
  // Preview step
  // -------------------------------------------------------------------------

  const toggleSkipDuplicate = useCallback((rowIndex: number) => {
    setSkippedDuplicates((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }, []);

  const skipAllDuplicates = useCallback(() => {
    setSkippedDuplicates(new Set(duplicates.map((d) => d.importRow.rowIndex)));
  }, [duplicates]);

  // -------------------------------------------------------------------------
  // Import step
  // -------------------------------------------------------------------------

  const startImport = useCallback(() => {
    if (validationResult === null || importingRef.current) {
      return;
    }

    importingRef.current = true;
    setStep('importing');

    // Filter out skipped duplicates
    const rowsToImport = validationResult.valid.filter(
      (row) => !skippedDuplicates.has(row.rowIndex),
    );

    const total = rowsToImport.length;
    setImportProgress({ current: 0, total });

    let imported = 0;
    let errors = 0;

    // Process in batches using microtasks to keep UI responsive
    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + IMPORT_BATCH_SIZE, total);

      for (let i = startIndex; i < endIndex; i++) {
        const row = rowsToImport[i];
        const result = createTransaction(row.data);
        if (result !== null) {
          imported++;
        } else {
          errors++;
        }
      }

      setImportProgress({ current: endIndex, total });

      if (endIndex < total) {
        // Yield to the event loop so the UI can repaint
        setTimeout(() => processBatch(endIndex), 0);
      } else {
        // Done
        const skipped = skippedDuplicates.size;
        setImportSummary({ imported, skipped, errors });
        setStep('complete');
        importingRef.current = false;
      }
    };

    // Kick off the first batch after a frame so the progress bar renders
    requestAnimationFrame(() => processBatch(0));
  }, [validationResult, skippedDuplicates, createTransaction]);

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  /** Step order for back-navigation. */
  const stepOrder: ImportStep[] = useMemo(
    () => ['upload', 'mapping', 'preview', 'importing', 'complete'],
    [],
  );

  const goBack = useCallback(() => {
    const currentIndex = stepOrder.indexOf(step);
    // Cannot go back from upload, importing, or complete
    if (currentIndex <= 0 || step === 'importing' || step === 'complete') {
      return;
    }
    setStep(stepOrder[currentIndex - 1]);
  }, [step, stepOrder]);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParseResult(null);
    setUploadError(null);
    setMappingSuggestions([]);
    setColumnMapping({});
    setValidationResult(null);
    setDuplicates([]);
    setSkippedDuplicates(new Set());
    setImportProgress({ current: 0, total: 0 });
    setImportSummary(null);
    importingRef.current = false;
  }, []);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    step,

    // Upload
    file,
    parseResult,
    uploadFile,
    uploadError,

    // Mapping
    mappingSuggestions,
    columnMapping,
    setColumnMapping,
    confirmMapping,

    // Preview
    validationResult,
    duplicates,
    skippedDuplicates,
    toggleSkipDuplicate,
    skipAllDuplicates,

    // Import
    importProgress,
    startImport,

    // Complete
    importSummary,

    // Navigation
    goBack,
    reset,

    // Account & household
    selectedAccountId,
    setSelectedAccountId,
    selectedHouseholdId,
    setSelectedHouseholdId,
  };
}
