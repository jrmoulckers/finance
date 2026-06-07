// SPDX-License-Identifier: BUSL-1.1

/**
 * CsvImportWizard — Multi-step CSV import wizard component.
 *
 * Guides users through importing financial transactions from CSV files:
 *   1. File upload (drag & drop + file picker)
 *   2. Column mapping (auto-detect + manual override)
 *   3. Preview with validation errors highlighted
 *   4. Import confirmation with duplicate warning
 *
 * Fully keyboard navigable and screen reader friendly.
 *
 * @module components/import/CsvImportWizard
 * References: issue #1339
 */

import React, { useCallback, useRef, useState } from 'react';
import { AppIcon } from '../icons';

import { parseCsv, autoDetectColumns, type CsvParseResult } from '../../utils/csvParser';

import './csv-import-wizard.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The four wizard steps. */
export type WizardStep = 'upload' | 'mapping' | 'preview' | 'confirm';

/** Column mapping from target field to source column index. */
export type ColumnMapping = Record<string, number | null>;

/** The required target fields for transaction import. */
const TARGET_FIELDS = [
  { key: 'date', label: 'Date', required: true },
  { key: 'description', label: 'Description', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const;

export interface CsvImportWizardProps {
  /** Callback when import is confirmed with mapped data. */
  onImport: (data: ImportData) => void;

  /** Callback when the wizard is cancelled. */
  onCancel: () => void;

  /** Number of potentially duplicate rows detected (from parent). */
  duplicateCount?: number;
}

/** Data passed to the onImport callback. */
export interface ImportData {
  /** Mapped rows ready for import. */
  rows: Record<string, string>[];

  /** The column mapping used. */
  mapping: ColumnMapping;

  /** Original filename. */
  filename: string;
}

// ---------------------------------------------------------------------------
// Step labels for accessibility
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<WizardStep, string> = {
  upload: 'Step 1: Upload CSV file',
  mapping: 'Step 2: Map columns',
  preview: 'Step 3: Preview data',
  confirm: 'Step 4: Confirm import',
};

const STEP_ORDER: WizardStep[] = ['upload', 'mapping', 'preview', 'confirm'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CsvImportWizard: React.FC<CsvImportWizardProps> = ({
  onImport,
  onCancel,
  duplicateCount = 0,
}) => {
  const [step, setStep] = useState<WizardStep>('upload');
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [filename, setFilename] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepIndex = STEP_ORDER.indexOf(step);

  // -----------------------------------------------------------------------
  // File handling
  // -----------------------------------------------------------------------

  const processFile = useCallback((file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseCsv(content);
      setParseResult(result);

      // Auto-detect column mapping
      const detected = autoDetectColumns(result.headers);
      const initialMapping: ColumnMapping = {};
      for (const field of TARGET_FIELDS) {
        initialMapping[field.key] = detected[field.key] ?? null;
      }
      setMapping(initialMapping);
      setStep('mapping');
    };
    reader.readAsText(file);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  // -----------------------------------------------------------------------
  // Column mapping
  // -----------------------------------------------------------------------

  const handleMappingChange = useCallback((field: string, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value === '' ? null : Number(value),
    }));
  }, []);

  const isMappingValid = TARGET_FIELDS.filter((f) => f.required).every(
    (f) => mapping[f.key] !== null && mapping[f.key] !== undefined,
  );

  // -----------------------------------------------------------------------
  // Build mapped rows for preview/import
  // -----------------------------------------------------------------------

  const getMappedRows = useCallback((): Record<string, string>[] => {
    if (!parseResult) return [];
    return parseResult.rows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const field of TARGET_FIELDS) {
        const colIndex = mapping[field.key];
        mapped[field.key] =
          colIndex !== null && colIndex !== undefined ? (row[colIndex] ?? '') : '';
      }
      return mapped;
    });
  }, [parseResult, mapping]);

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const goNext = useCallback(() => {
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }, [stepIndex]);

  const goBack = useCallback(() => {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }, [stepIndex]);

  const handleConfirm = useCallback(() => {
    onImport({
      rows: getMappedRows(),
      mapping,
      filename,
    });
  }, [onImport, getMappedRows, mapping, filename]);

  // -----------------------------------------------------------------------
  // Render steps
  // -----------------------------------------------------------------------

  const renderUploadStep = () => (
    <div
      className={`csv-import-wizard__dropzone ${dragActive ? 'csv-import-wizard__dropzone--active' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload CSV file. Click or drag and drop."
    >
      <AppIcon name="folder" />
      <p className="csv-import-wizard__dropzone-text">
        Drag and drop a CSV file here, or click to browse
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileSelect}
        className="csv-import-wizard__file-input"
        aria-label="Choose CSV file"
      />
    </div>
  );

  const renderMappingStep = () => (
    <div className="csv-import-wizard__mapping" role="group" aria-label="Column mapping">
      {TARGET_FIELDS.map((field) => (
        <div key={field.key} className="csv-import-wizard__mapping-row">
          <label htmlFor={`mapping-${field.key}`} className="csv-import-wizard__mapping-label">
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </label>
          <select
            id={`mapping-${field.key}`}
            className="csv-import-wizard__mapping-select"
            value={mapping[field.key] ?? ''}
            onChange={(e) => handleMappingChange(field.key, e.target.value)}
            aria-required={field.required}
          >
            <option value="">— Select column —</option>
            {parseResult?.headers.map((header, i) => (
              <option key={i} value={i}>
                {header}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );

  const renderPreviewStep = () => {
    const mappedRows = getMappedRows();
    const previewRows = mappedRows.slice(0, 10);

    return (
      <div className="csv-import-wizard__preview">
        <table className="csv-import-wizard__table" aria-label="Import preview">
          <thead>
            <tr>
              <th scope="col">#</th>
              {TARGET_FIELDS.filter((f) => mapping[f.key] !== null).map((f) => (
                <th key={f.key} scope="col">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                {TARGET_FIELDS.filter((f) => mapping[f.key] !== null).map((f) => (
                  <td key={f.key}>{row[f.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {mappedRows.length > 10 && (
          <p className="csv-import-wizard__step-info" role="status">
            Showing 10 of {mappedRows.length} rows
          </p>
        )}
      </div>
    );
  };

  const renderConfirmStep = () => {
    const mappedRows = getMappedRows();

    return (
      <div>
        <div className="csv-import-wizard__summary" role="group" aria-label="Import summary">
          <div className="csv-import-wizard__summary-item">
            <span className="csv-import-wizard__summary-label">File:</span>
            <span className="csv-import-wizard__summary-value">{filename}</span>
          </div>
          <div className="csv-import-wizard__summary-item">
            <span className="csv-import-wizard__summary-label">Rows to import:</span>
            <span className="csv-import-wizard__summary-value">{mappedRows.length}</span>
          </div>
          {parseResult?.errors && parseResult.errors.length > 0 && (
            <div className="csv-import-wizard__summary-item">
              <span className="csv-import-wizard__summary-label">Rows with warnings:</span>
              <span className="csv-import-wizard__summary-value">{parseResult.errors.length}</span>
            </div>
          )}
        </div>

        {duplicateCount > 0 && (
          <div className="csv-import-wizard__warning" role="alert">
            <AppIcon name="alert-triangle" /> {duplicateCount} potential duplicate
            {duplicateCount === 1 ? ' transaction' : ' transactions'} detected. These will be
            skipped during import.
          </div>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <section className="csv-import-wizard" aria-label="CSV Import Wizard">
      <div className="csv-import-wizard__header">
        <h2 className="csv-import-wizard__title">Import Transactions</h2>
        <p className="csv-import-wizard__step-info" aria-live="polite">
          {STEP_LABELS[step]}
        </p>
      </div>

      <div className="csv-import-wizard__content">
        {step === 'upload' && renderUploadStep()}
        {step === 'mapping' && renderMappingStep()}
        {step === 'preview' && renderPreviewStep()}
        {step === 'confirm' && renderConfirmStep()}
      </div>

      <div className="csv-import-wizard__actions">
        <button
          type="button"
          className="csv-import-wizard__btn"
          onClick={step === 'upload' ? onCancel : goBack}
        >
          {step === 'upload' ? 'Cancel' : 'Back'}
        </button>

        {step !== 'upload' && (
          <button
            type="button"
            className="csv-import-wizard__btn csv-import-wizard__btn--primary"
            onClick={step === 'confirm' ? handleConfirm : goNext}
            disabled={step === 'mapping' && !isMappingValid}
            aria-disabled={step === 'mapping' && !isMappingValid}
          >
            {step === 'confirm' ? 'Import' : 'Next'}
          </button>
        )}
      </div>
    </section>
  );
};
