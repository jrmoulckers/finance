// SPDX-License-Identifier: BUSL-1.1

/**
 * Data Import Wizard page.
 *
 * CSV upload with column mapping, bank-specific format auto-detection
 * (Mint, YNAB, Chase, Amex, Wells Fargo, Citi), mapped preview with
 * inline error correction, unmapped field warnings, card-based duplicate
 * comparison, and progress indicator.
 *
 * References: issues #1076, #1468, #1469
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { AppIcon } from '../components/icons';

import { useDataImportWizard } from '../hooks/useDataImportWizard';
import type {
  TransactionField,
  ImportPreviewRow,
  DuplicateComparison,
  DuplicateAction,
} from '../hooks/useDataImportWizard';

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

const STEP_LABELS: Record<string, string> = {
  upload: 'Upload File',
  mapping: 'Map Columns',
  preview: 'Preview',
  importing: 'Importing',
  complete: 'Complete',
};

// ---------------------------------------------------------------------------
// Inline Editable Field
// ---------------------------------------------------------------------------

interface InlineEditFieldProps {
  readonly value: string;
  readonly fieldName: string;
  readonly hasError: boolean;
  readonly errorMessage?: string;
  readonly onSave: (value: string) => void;
}

/** Editable field that toggles between display and input on click. */
function InlineEditField({
  value,
  fieldName,
  hasError,
  errorMessage,
  onSave,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [value]);

  const handleCommit = useCallback(() => {
    setEditing(false);
    onSave(draft);
  }, [draft, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCommit();
      if (e.key === 'Escape') {
        setEditing(false);
        setDraft(value);
      }
    },
    [handleCommit, value],
  );

  if (editing) {
    const inputType = fieldName === 'date' ? 'date' : fieldName === 'amount' ? 'number' : 'text';
    return (
      <input
        ref={inputRef}
        type={inputType}
        className="import-inline-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        aria-label={`Edit ${fieldName}`}
        step={fieldName === 'amount' ? '0.01' : undefined}
      />
    );
  }

  return (
    <button
      type="button"
      className={`import-inline-display${hasError ? ' import-inline-display--error' : ''}`}
      onClick={handleStartEdit}
      aria-label={`${value || '—'}, click to edit ${fieldName}${hasError ? `, error: ${errorMessage ?? 'validation error'}` : ''}`}
      title={hasError ? errorMessage : `Click to edit ${fieldName}`}
    >
      {hasError && (
        <span className="import-inline-error-icon" aria-hidden="true">
          <AppIcon name="alert-triangle" />
        </span>
      )}
      {value || '—'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Duplicate Comparison Card
// ---------------------------------------------------------------------------

interface DuplicateComparisonCardProps {
  readonly comparison: DuplicateComparison;
  readonly action: DuplicateAction;
  readonly onAction: (rowIndex: number, action: DuplicateAction) => void;
}

/** Side-by-side comparison card for duplicate transactions. */
function DuplicateComparisonCard({ comparison, action, onAction }: DuplicateComparisonCardProps) {
  const { rowIndex, importRow, existingTransaction } = comparison;

  return (
    <article
      className="import-duplicate-card"
      aria-label={`Duplicate comparison for row ${rowIndex + 1}`}
    >
      <div className="import-duplicate-card__header">
        <span className="import-duplicate-card__badge" aria-hidden="true">
          <AppIcon name="alert-triangle" /> Potential Duplicate
        </span>
        <span className="import-duplicate-card__row">Row {rowIndex + 1}</span>
      </div>

      <div className="import-duplicate-card__compare">
        <div className="import-duplicate-card__side">
          <h4 className="import-duplicate-card__side-title">Existing</h4>
          <dl className="import-duplicate-card__fields">
            <div className="import-duplicate-card__field">
              <dt>Date</dt>
              <dd>{existingTransaction.date}</dd>
            </div>
            <div className="import-duplicate-card__field">
              <dt>Payee</dt>
              <dd>{existingTransaction.payee}</dd>
            </div>
            <div className="import-duplicate-card__field">
              <dt>Amount</dt>
              <dd>{existingTransaction.amount}</dd>
            </div>
            <div className="import-duplicate-card__field">
              <dt>Category</dt>
              <dd>{existingTransaction.category}</dd>
            </div>
          </dl>
        </div>

        <div className="import-duplicate-card__divider" aria-hidden="true">
          ↔
        </div>

        <div className="import-duplicate-card__side">
          <h4 className="import-duplicate-card__side-title">Import</h4>
          <dl className="import-duplicate-card__fields">
            <div className="import-duplicate-card__field">
              <dt>Date</dt>
              <dd>{importRow.parsed.date ?? '—'}</dd>
            </div>
            <div className="import-duplicate-card__field">
              <dt>Payee</dt>
              <dd>{importRow.parsed.payee ?? '—'}</dd>
            </div>
            <div className="import-duplicate-card__field">
              <dt>Amount</dt>
              <dd>
                {importRow.parsed.amountCents != null
                  ? `$${(importRow.parsed.amountCents / 100).toFixed(2)}`
                  : '—'}
              </dd>
            </div>
            <div className="import-duplicate-card__field">
              <dt>Category</dt>
              <dd>{importRow.parsed.category ?? 'Uncategorized'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="import-duplicate-card__actions" role="group" aria-label="Duplicate actions">
        <button
          type="button"
          className={`import-button import-button--small${action === 'skip' ? ' import-button--active' : ''}`}
          onClick={() => onAction(rowIndex, 'skip')}
          aria-pressed={action === 'skip'}
        >
          Skip
        </button>
        <button
          type="button"
          className={`import-button import-button--small${action === 'import' ? ' import-button--active' : ''}`}
          onClick={() => onAction(rowIndex, 'import')}
          aria-pressed={action === 'import'}
        >
          Import Anyway
        </button>
        <button
          type="button"
          className={`import-button import-button--small${action === 'replace' ? ' import-button--active' : ''}`}
          onClick={() => onAction(rowIndex, 'replace')}
          aria-pressed={action === 'replace'}
        >
          Replace
        </button>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Preview Transaction Row (app-style card rendering)
// ---------------------------------------------------------------------------

interface PreviewTransactionRowProps {
  readonly row: ImportPreviewRow;
  readonly onFieldEdit: (rowIndex: number, field: string, value: string) => void;
}

/** Renders a preview row as an app-style transaction card with inline editing. */
function PreviewTransactionRow({ row, onFieldEdit }: PreviewTransactionRowProps) {
  const handleSave = useCallback(
    (field: string) => (value: string) => {
      onFieldEdit(row.rowIndex, field, value);
    },
    [row.rowIndex, onFieldEdit],
  );

  return (
    <article
      className={`import-preview-card${row.hasError ? ' import-preview-card--error' : ''}${row.isDuplicate ? ' import-preview-card--duplicate' : ''}`}
      aria-label={`Transaction row ${row.rowIndex + 1}: ${row.parsed.payee ?? 'Unknown'}`}
    >
      <div className="import-preview-card__row-num">{row.rowIndex + 1}</div>
      <div className="import-preview-card__content">
        <div className="import-preview-card__main">
          <div className="import-preview-card__field">
            <span className="import-preview-card__label">Date</span>
            <InlineEditField
              value={row.parsed.date ?? ''}
              fieldName="date"
              hasError={'date' in row.fieldErrors}
              errorMessage={row.fieldErrors.date}
              onSave={handleSave('date')}
            />
          </div>
          <div className="import-preview-card__field">
            <span className="import-preview-card__label">Payee</span>
            <InlineEditField
              value={row.parsed.payee ?? ''}
              fieldName="payee"
              hasError={'payee' in row.fieldErrors}
              errorMessage={row.fieldErrors.payee}
              onSave={handleSave('payee')}
            />
          </div>
          <div className="import-preview-card__field">
            <span className="import-preview-card__label">Amount</span>
            <InlineEditField
              value={
                row.parsed.amountCents != null ? (row.parsed.amountCents / 100).toFixed(2) : ''
              }
              fieldName="amount"
              hasError={'amount' in row.fieldErrors}
              errorMessage={row.fieldErrors.amount}
              onSave={handleSave('amount')}
            />
          </div>
        </div>
        <div className="import-preview-card__secondary">
          <span className="import-preview-card__category">
            {row.parsed.category ?? 'Uncategorized'}
          </span>
          {row.parsed.account && (
            <span className="import-preview-card__account">{row.parsed.account}</span>
          )}
        </div>
      </div>
      <div className="import-preview-card__status">
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
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataImportWizardPage() {
  const {
    step,
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

  // -- Computed preview stats -----------------------------------------------

  const validCount = previewRows.filter((r) => !r.hasError && !r.isDuplicate).length;
  const duplicateCount = previewRows.filter((r) => r.isDuplicate).length;
  const errorCount = previewRows.filter((r) => r.hasError).length;

  return (
    <div className="import-wizard" aria-labelledby="import-wizard-title">
      <h2 id="import-wizard-title" className="import-wizard__title">
        Import Transactions
      </h2>

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
                {i < currentStepIndex ? <AppIcon name="check" /> : i + 1}
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
            Drag and drop a CSV file, or click to browse. Supports Mint, YNAB, Chase, American
            Express, Wells Fargo, Citi, and custom formats.
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
              <AppIcon name="folder" />
            </span>
            <span className="import-dropzone__text">
              {dragActive ? 'Drop your file here' : 'Click or drag CSV file here'}
            </span>
            <span className="import-dropzone__hint">
              Supported: .csv files from Mint, YNAB, Chase, Amex, Wells Fargo, Citi, or custom
              exports
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
              aria-label={`Detected format: ${detectedFormatLabel}`}
            >
              Detected: {detectedFormatLabel}
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

          {/* Unmapped fields warning */}
          {unmappedFields.length > 0 && (
            <div className="import-unmapped-warning" role="status">
              <span className="import-unmapped-warning__icon" aria-hidden="true">
                ℹ️
              </span>
              <div className="import-unmapped-warning__content">
                <p className="import-unmapped-warning__text">
                  These fields will not be imported:{' '}
                  <strong>{unmappedFields.map((f) => f.columnName).join(', ')}</strong>
                </p>
                <button
                  type="button"
                  className="import-button import-button--small import-button--secondary"
                  onClick={mapUnmappedToNotes}
                  aria-label="Map all unmapped fields to Notes"
                >
                  Map to Notes
                </button>
              </div>
            </div>
          )}

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

      {/* Preview Step — card-based with inline editing */}
      {step === 'preview' && (
        <section className="import-card" aria-labelledby="preview-title">
          <h2 id="preview-title" className="import-card__title">
            Preview ({previewRows.length} transactions)
          </h2>

          <div className="import-preview-stats" role="status">
            <span className="import-stat import-stat--success">
              <AppIcon name="check" /> {validCount} valid
            </span>
            <span className="import-stat import-stat--warning">
              <AppIcon name="alert-triangle" /> {duplicateCount} duplicates
            </span>
            <span className="import-stat import-stat--error">
              <AppIcon name="x" /> {errorCount} errors
            </span>
          </div>

          {errorCount > 0 && (
            <p className="import-card__description">
              Click on highlighted fields to edit values inline and fix validation errors.
            </p>
          )}

          {/* Transaction preview cards */}
          <div className="import-preview-cards" role="list" aria-label="Transaction preview">
            {previewRows
              .filter((r) => !r.isDuplicate)
              .slice(0, 20)
              .map((row) => (
                <div key={row.rowIndex} role="listitem">
                  <PreviewTransactionRow row={row} onFieldEdit={updatePreviewField} />
                </div>
              ))}
          </div>

          {/* Duplicate comparison cards */}
          {duplicateComparisons.length > 0 && (
            <div className="import-duplicate-section">
              <h3 className="import-duplicate-section__title">
                Duplicate Review ({duplicateComparisons.length})
              </h3>
              <p className="import-card__description">
                These transactions appear to already exist. Choose an action for each.
              </p>
              <div className="import-duplicate-list" role="list" aria-label="Duplicate comparisons">
                {duplicateComparisons.map((comp) => (
                  <div key={comp.rowIndex} role="listitem">
                    <DuplicateComparisonCard
                      comparison={comp}
                      action={duplicateActions[comp.rowIndex] ?? 'skip'}
                      onAction={setDuplicateAction}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

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
            <AppIcon name="sparkles" />
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
    </div>
  );
}

export default DataImportWizardPage;
