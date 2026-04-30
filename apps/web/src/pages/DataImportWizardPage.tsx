// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Import Wizard page.
 *
 * CSV upload with column mapping, Mint/YNAB format auto-detection,
 * preview table, duplicate detection, and progress indicator.
 *
 * References: issue #1076
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';

import { useDataImportWizard } from '../hooks/useDataImportWizard';
import type { TransactionField } from '../hooks/useDataImportWizard';

import './DataImportWizardPage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_OPTIONS: readonly { value: TransactionField; label: string }[] = [
  { value: 'skip', label: '— Skip —' },
  { value: 'date', label: 'Date' },
  { value: 'payee', label: 'Payee' },
  { value: 'amount', label: 'Amount' },
  { value: 'category', label: 'Category' },
  { value: 'account', label: 'Account' },
  { value: 'note', label: 'Note' },
  { value: 'type', label: 'Type' },
];

const FORMAT_LABELS: Record<string, string> = {
  mint: 'Mint Export',
  ynab: 'YNAB Export',
  generic: 'Generic CSV',
  unknown: 'Unknown Format',
};

const STEP_LABELS: Record<string, string> = {
  upload: 'Upload File',
  mapping: 'Map Columns',
  preview: 'Preview',
  importing: 'Importing',
  complete: 'Complete',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataImportWizardPage() {
  const {
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
  } = useDataImportWizard();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // -- File handling -------------------------------------------------------

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
        return;
      }
      await uploadFile(file);
    },
    [uploadFile],
  );

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) await handleFile(file);
    },
    [handleFile],
  );

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files[0];
      if (file) await handleFile(file);
    },
    [handleFile],
  );

  // -- Step indicator -------------------------------------------------------

  const steps = ['upload', 'mapping', 'preview', 'importing', 'complete'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <main className="import-wizard" aria-labelledby="import-wizard-title">
      <h1 id="import-wizard-title" className="import-wizard__title">
        Import Transactions
      </h1>

      {/* Step indicator */}
      <nav className="import-wizard__steps" aria-label="Import wizard progress">
        <ol className="import-steps">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`import-step ${i === currentStepIndex ? 'import-step--active' : ''} ${i < currentStepIndex ? 'import-step--completed' : ''}`}
              aria-current={i === currentStepIndex ? 'step' : undefined}
            >
              <span className="import-step__number" aria-hidden="true">
                {i < currentStepIndex ? '✓' : i + 1}
              </span>
              <span className="import-step__label">{STEP_LABELS[s]}</span>
            </li>
          ))}
        </ol>
      </nav>

      {error && (
        <div className="import-banner--error" role="alert">
          {error}
        </div>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <section className="import-card" aria-labelledby="upload-title">
          <h2 id="upload-title" className="import-card__title">
            Upload CSV File
          </h2>
          <p className="import-card__description">
            Drag and drop a CSV file, or click to browse. Supports Mint, YNAB, and custom formats.
          </p>

          <div
            className={`import-dropzone ${dragActive ? 'import-dropzone--active' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Drop CSV file here or click to browse"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <span className="import-dropzone__icon" aria-hidden="true">
              📁
            </span>
            <span className="import-dropzone__text">
              {dragActive ? 'Drop your file here' : 'Click or drag CSV file here'}
            </span>
            <span className="import-dropzone__hint">
              Supported: .csv files from Mint, YNAB, or custom exports
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="import-hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </section>
      )}

      {/* Mapping Step */}
      {step === 'mapping' && (
        <section className="import-card" aria-labelledby="mapping-title">
          <div className="import-card__header">
            <h2 id="mapping-title" className="import-card__title">
              Map Columns
            </h2>
            <span
              className="import-format-badge"
              aria-label={`Detected format: ${FORMAT_LABELS[detectedFormat]}`}
            >
              {FORMAT_LABELS[detectedFormat]}
            </span>
          </div>
          <p className="import-card__description">
            {csvRows.length} rows found. Assign each CSV column to a transaction field.
          </p>

          <div
            className="import-mapping-table-wrapper"
            role="region"
            aria-label="Column mapping"
            tabIndex={0}
          >
            <table className="import-mapping-table" aria-label="CSV column mapping">
              <thead>
                <tr>
                  <th scope="col">CSV Column</th>
                  <th scope="col">Sample Data</th>
                  <th scope="col">Map To</th>
                </tr>
              </thead>
              <tbody>
                {csvColumns.map((col) => {
                  const mapping = columnMappings.find((m) => m.columnIndex === col.index);
                  return (
                    <tr key={col.index}>
                      <td className="import-mapping-table__col-name">{col.name}</td>
                      <td className="import-mapping-table__sample">
                        {col.sampleValues.slice(0, 2).join(', ')}
                      </td>
                      <td>
                        <select
                          className="import-mapping-select"
                          value={mapping?.mappedField ?? 'skip'}
                          onChange={(e) =>
                            setColumnMapping(col.index, e.target.value as TransactionField)
                          }
                          aria-label={`Mapping for ${col.name}`}
                        >
                          {FIELD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="import-actions">
            <button className="import-button import-button--secondary" onClick={goBack}>
              Back
            </button>
            <button className="import-button import-button--primary" onClick={goToPreview}>
              Preview Import
            </button>
          </div>
        </section>
      )}

      {/* Preview Step */}
      {step === 'preview' && (
        <section className="import-card" aria-labelledby="preview-title">
          <h2 id="preview-title" className="import-card__title">
            Preview ({previewRows.length} rows)
          </h2>

          <div className="import-preview-stats" role="status">
            <span className="import-stat import-stat--success">
              ✓ {previewRows.filter((r) => !r.hasError && !r.isDuplicate).length} valid
            </span>
            <span className="import-stat import-stat--warning">
              ⚠ {previewRows.filter((r) => r.isDuplicate).length} duplicates
            </span>
            <span className="import-stat import-stat--error">
              ✗ {previewRows.filter((r) => r.hasError).length} errors
            </span>
          </div>

          <div
            className="import-preview-table-wrapper"
            role="region"
            aria-label="Import preview"
            tabIndex={0}
          >
            <table className="import-preview-table" aria-label="Transaction preview">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Date</th>
                  <th scope="col">Payee</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 20).map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={
                      row.isDuplicate
                        ? 'import-row--duplicate'
                        : row.hasError
                          ? 'import-row--error'
                          : ''
                    }
                  >
                    <td>{row.rowIndex + 1}</td>
                    <td>{row.parsed.date ?? '—'}</td>
                    <td>{row.parsed.payee ?? '—'}</td>
                    <td>
                      {row.parsed.amountCents != null
                        ? `$${(row.parsed.amountCents / 100).toFixed(2)}`
                        : '—'}
                    </td>
                    <td>{row.parsed.category ?? '—'}</td>
                    <td>
                      {row.isDuplicate ? (
                        <span className="import-status import-status--duplicate">Duplicate</span>
                      ) : row.hasError ? (
                        <span
                          className="import-status import-status--error"
                          title={row.errorMessage ?? undefined}
                        >
                          Error
                        </span>
                      ) : (
                        <span className="import-status import-status--valid">Valid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-actions">
            <button className="import-button import-button--secondary" onClick={goBack}>
              Back
            </button>
            <button className="import-button import-button--primary" onClick={startImport}>
              Start Import
            </button>
          </div>
        </section>
      )}

      {/* Importing Step */}
      {step === 'importing' && progress && (
        <section className="import-card" aria-labelledby="importing-title">
          <h2 id="importing-title" className="import-card__title">
            Importing Transactions…
          </h2>

          <div
            className="import-progress"
            role="progressbar"
            aria-valuenow={progress.percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Import progress"
          >
            <div
              className="import-progress__bar"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>

          <div className="import-progress__stats" aria-live="polite">
            <span>
              {progress.current} / {progress.total} transactions
            </span>
            <span>{progress.percentComplete}%</span>
          </div>
        </section>
      )}

      {/* Complete Step */}
      {step === 'complete' && result && (
        <section className="import-card import-card--complete" aria-labelledby="complete-title">
          <span className="import-complete-icon" aria-hidden="true">
            🎉
          </span>
          <h2 id="complete-title" className="import-card__title">
            Import Complete!
          </h2>

          <div className="import-result-grid" role="list" aria-label="Import results">
            <div className="import-result-stat" role="listitem">
              <span className="import-result-stat__value">{result.imported}</span>
              <span className="import-result-stat__label">Imported</span>
            </div>
            <div className="import-result-stat" role="listitem">
              <span className="import-result-stat__value">{result.duplicatesSkipped}</span>
              <span className="import-result-stat__label">Duplicates Skipped</span>
            </div>
            <div className="import-result-stat" role="listitem">
              <span className="import-result-stat__value">{result.errors}</span>
              <span className="import-result-stat__label">Errors</span>
            </div>
          </div>

          <button className="import-button import-button--primary" onClick={reset}>
            Import Another File
          </button>
        </section>
      )}
    </main>
  );
}

export default DataImportWizardPage;
