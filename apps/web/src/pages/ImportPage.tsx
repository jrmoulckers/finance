// SPDX-License-Identifier: BUSL-1.1

/**
 * CSV Import page — multi-step wizard for importing transactions from CSV files.
 *
 * Steps:
 *   1. **Upload** — select a .csv file and target account
 *   2. **Map Columns** — map CSV columns to transaction fields
 *   3. **Preview** — review validation results and duplicates
 *   4. **Importing** — progress indicator during batch import
 *   5. **Complete** — success summary with navigation
 *
 * Accessibility:
 *   - All steps use semantic HTML (`<section>`, `<table>`, `<fieldset>`)
 *   - File input has proper `<label>`
 *   - Progress updates use `aria-live="polite"`
 *   - Step indicator shows current step and total
 *   - Error messages use `role="alert"`
 *   - All buttons have clear labels
 *   - Keyboard-accessible throughout
 */

import React, { useCallback, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAccounts } from '../hooks/useAccounts';
import { useImport, type ImportStep } from '../hooks/useImport';
import type { ColumnMapping, TransactionField } from '../lib/csv-column-mapper';

import '../styles/import.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<ImportStep, string> = {
  upload: 'Upload File',
  mapping: 'Map Columns',
  preview: 'Preview',
  importing: 'Importing',
  complete: 'Complete',
};

const STEP_ORDER: ImportStep[] = ['upload', 'mapping', 'preview', 'importing', 'complete'];

const TRANSACTION_FIELDS: { value: TransactionField | ''; label: string }[] = [
  { value: '', label: '— Unmapped —' },
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'description', label: 'Description' },
  { value: 'payee', label: 'Payee' },
  { value: 'category', label: 'Category' },
  { value: 'type', label: 'Type' },
  { value: 'note', label: 'Note' },
  { value: 'tags', label: 'Tags' },
];

const MAX_PREVIEW_ROWS = 3;

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

interface StepIndicatorProps {
  currentStep: ImportStep;
}

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <nav aria-label="Import progress">
      <ol className="import-step-indicator">
        {STEP_ORDER.map((step, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;
          let className = 'import-step-indicator__step';
          if (isActive) className += ' import-step-indicator__step--active';
          if (isCompleted) className += ' import-step-indicator__step--completed';

          return (
            <React.Fragment key={step}>
              {index > 0 && (
                <li
                  className="import-step-indicator__connector"
                  aria-hidden="true"
                  role="presentation"
                />
              )}
              <li className={className} aria-current={isActive ? 'step' : undefined}>
                <span className="import-step-indicator__number" aria-hidden="true">
                  {isCompleted ? '✓' : index + 1}
                </span>
                <span className="import-step-indicator__label">{STEP_LABELS[step]}</span>
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        Step {currentIndex + 1} of {STEP_ORDER.length}: {STEP_LABELS[currentStep]}
      </p>
    </nav>
  );
};

// ---------------------------------------------------------------------------
// Upload Step
// ---------------------------------------------------------------------------

interface UploadStepProps {
  onUpload: (file: File) => void;
  uploadError: string | null;
  selectedAccountId: string | null;
  onSelectAccount: (id: string) => void;
}

const UploadStep: React.FC<UploadStepProps> = ({
  onUpload,
  uploadError,
  selectedAccountId,
  onSelectAccount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputId = useId();
  const accountSelectId = useId();
  const { accounts, loading: accountsLoading } = useAccounts();

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        onUpload(file);
      }
    },
    [onUpload],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      const file = event.dataTransfer.files[0];
      if (file) {
        onUpload(file);
      }
    },
    [onUpload],
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleBrowseClick();
      }
    },
    [handleBrowseClick],
  );

  return (
    <section aria-labelledby="upload-heading">
      <h3 id="upload-heading" className="import-section-heading">
        Upload CSV File
      </h3>
      <p className="import-section-description">
        Select a CSV file containing your transactions. Supported format: .csv (max 10 MB).
      </p>

      <div className="import-account-selector">
        <label htmlFor={accountSelectId} className="import-account-selector__label">
          Import into account
        </label>
        <select
          id={accountSelectId}
          className="form-select"
          value={selectedAccountId ?? ''}
          onChange={(e) => onSelectAccount(e.target.value)}
          aria-required="true"
          disabled={accountsLoading}
        >
          <option value="" disabled>
            {accountsLoading ? 'Loading accounts…' : 'Select an account'}
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div
        className={`import-upload-zone${isDragOver ? ' import-upload-zone--drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onClick={handleBrowseClick}
        style={{ marginTop: 'var(--spacing-4)' }}
      >
        <span className="import-upload-zone__icon" aria-hidden="true">
          📁
        </span>
        <p className="import-upload-zone__text">
          Drag and drop your CSV file here, or{' '}
          <span className="import-upload-zone__browse">browse</span>
        </p>
        <p className="import-upload-zone__hint">.csv files up to 10 MB</p>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".csv"
          className="import-upload-zone__input"
          onChange={handleFileChange}
          aria-label="Choose CSV file to import"
          tabIndex={-1}
        />
      </div>

      {uploadError !== null && (
        <div className="import-error-banner" role="alert">
          <span aria-hidden="true">⚠️</span>
          {uploadError}
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Mapping Step
// ---------------------------------------------------------------------------

interface MappingStepProps {
  headers: string[];
  previewRows: string[][];
  mappingSuggestions: {
    columnIndex: number;
    suggestedField: TransactionField;
    confidence: number;
  }[];
  columnMapping: ColumnMapping;
  onSetMapping: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onBack: () => void;
  canConfirm: boolean;
}

function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.8) return 'import-mapping-table__confidence--high';
  if (confidence >= 0.5) return 'import-mapping-table__confidence--medium';
  return 'import-mapping-table__confidence--low';
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

const MappingStep: React.FC<MappingStepProps> = ({
  headers,
  previewRows,
  mappingSuggestions,
  columnMapping,
  onSetMapping,
  onConfirm,
  onBack,
  canConfirm,
}) => {
  const handleFieldChange = useCallback(
    (columnIndex: number, value: string) => {
      const newMapping = { ...columnMapping };
      if (value === '') {
        delete newMapping[columnIndex];
      } else {
        newMapping[columnIndex] = value as TransactionField;
      }
      onSetMapping(newMapping);
    },
    [columnMapping, onSetMapping],
  );

  const suggestionMap = new Map(mappingSuggestions.map((s) => [s.columnIndex, s]));

  return (
    <section aria-labelledby="mapping-heading">
      <h3 id="mapping-heading" className="import-section-heading">
        Map Columns
      </h3>
      <p className="import-section-description">
        Match each CSV column to a transaction field. Columns marked &ldquo;Unmapped&rdquo; will be
        ignored during import.
      </p>

      <div className="import-table-wrapper">
        <table className="import-mapping-table" aria-label="Column mapping">
          <thead>
            <tr>
              <th scope="col">CSV Column</th>
              <th scope="col">Map To</th>
              <th scope="col">Confidence</th>
              <th scope="col">Preview</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, index) => {
              const suggestion = suggestionMap.get(index);
              const selectedValue = columnMapping[index] ?? '';

              return (
                <tr key={index}>
                  <td>
                    <strong>{header}</strong>
                  </td>
                  <td>
                    <select
                      className="form-select"
                      value={selectedValue}
                      onChange={(e) => handleFieldChange(index, e.target.value)}
                      aria-label={`Map "${header}" to transaction field`}
                    >
                      {TRANSACTION_FIELDS.map((field) => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {suggestion ? (
                      <span
                        className={`import-mapping-table__confidence ${getConfidenceClass(suggestion.confidence)}`}
                      >
                        {getConfidenceLabel(suggestion.confidence)} (
                        {Math.round(suggestion.confidence * 100)}%)
                      </span>
                    ) : (
                      <span className="import-mapping-table__confidence import-mapping-table__confidence--low">
                        —
                      </span>
                    )}
                  </td>
                  <td className="import-mapping-table__preview-cell">
                    {previewRows
                      .slice(0, MAX_PREVIEW_ROWS)
                      .map((row) => row[index] ?? '')
                      .filter(Boolean)
                      .join(' | ')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="import-actions">
        <button type="button" className="form-button form-button--secondary" onClick={onBack}>
          Back
        </button>
        <div className="import-actions__end">
          <button
            type="button"
            className="form-button form-button--primary"
            onClick={onConfirm}
            disabled={!canConfirm}
            aria-disabled={!canConfirm}
          >
            Continue
          </button>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Preview Step
// ---------------------------------------------------------------------------

interface PreviewStepProps {
  validationResult: NonNullable<ReturnType<typeof useImport>['validationResult']>;
  duplicates: ReturnType<typeof useImport>['duplicates'];
  skippedDuplicates: Set<number>;
  onToggleSkipDuplicate: (rowIndex: number) => void;
  onSkipAllDuplicates: () => void;
  onStartImport: () => void;
  onBack: () => void;
}

const PreviewStep: React.FC<PreviewStepProps> = ({
  validationResult,
  duplicates,
  skippedDuplicates,
  onToggleSkipDuplicate,
  onSkipAllDuplicates,
  onStartImport,
  onBack,
}) => {
  const validCount = validationResult.valid.length;
  const errorCount = validationResult.errors.length;
  const duplicateCount = duplicates.length;
  const importableCount = validCount - skippedDuplicates.size;

  return (
    <section aria-labelledby="preview-heading">
      <h3 id="preview-heading" className="import-section-heading">
        Preview Import
      </h3>

      {/* Summary stats */}
      <div className="import-preview-summary" role="group" aria-label="Import summary">
        <div className="import-preview-stat import-preview-stat--success">
          <span className="import-preview-stat__value">{validCount}</span>
          <span className="import-preview-stat__label">Valid rows</span>
        </div>
        <div
          className={`import-preview-stat${errorCount > 0 ? ' import-preview-stat--errors' : ''}`}
        >
          <span className="import-preview-stat__value">{errorCount}</span>
          <span className="import-preview-stat__label">Errors</span>
        </div>
        <div className="import-preview-stat">
          <span className="import-preview-stat__value">{duplicateCount}</span>
          <span className="import-preview-stat__label">Potential duplicates</span>
        </div>
        <div className="import-preview-stat import-preview-stat--success">
          <span className="import-preview-stat__value">{importableCount}</span>
          <span className="import-preview-stat__label">Will be imported</span>
        </div>
      </div>

      {/* Validation errors */}
      {errorCount > 0 && (
        <div>
          <h4 className="import-section-heading">Validation Errors ({errorCount})</h4>
          <div className="import-table-wrapper">
            <table className="import-error-table" aria-label="Validation errors">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Field</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {validationResult.errors.map((error, index) => (
                  <tr key={`${error.rowIndex}-${error.field}-${index}`}>
                    <td>{error.rowIndex + 1}</td>
                    <td>{error.field}</td>
                    <td className="import-error-table__message">{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Duplicates */}
      {duplicateCount > 0 && (
        <div>
          <h4 className="import-section-heading">Potential Duplicates ({duplicateCount})</h4>
          <p className="import-section-description">
            These rows appear to match existing transactions. Check the rows you want to skip.
          </p>
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={onSkipAllDuplicates}
            style={{ marginBottom: 'var(--spacing-3)' }}
          >
            Skip All Duplicates
          </button>
          <div className="import-table-wrapper">
            <table className="import-duplicate-table" aria-label="Potential duplicate transactions">
              <thead>
                <tr>
                  <th scope="col">Skip</th>
                  <th scope="col">Row</th>
                  <th scope="col">Match Score</th>
                  <th scope="col">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map((dup) => {
                  const checkboxId = `skip-dup-${dup.importRow.rowIndex}`;
                  return (
                    <tr key={dup.importRow.rowIndex}>
                      <td>
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={skippedDuplicates.has(dup.importRow.rowIndex)}
                          onChange={() => onToggleSkipDuplicate(dup.importRow.rowIndex)}
                          aria-label={`Skip row ${dup.importRow.rowIndex + 1}`}
                        />
                      </td>
                      <td>{dup.importRow.rowIndex + 1}</td>
                      <td className="import-duplicate-table__score">
                        {Math.round(dup.matchScore * 100)}%
                      </td>
                      <td className="import-duplicate-table__reasons">
                        {dup.matchReasons.join(', ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="import-actions">
        <button type="button" className="form-button form-button--secondary" onClick={onBack}>
          Back
        </button>
        <div className="import-actions__end">
          <button
            type="button"
            className="form-button form-button--primary"
            onClick={onStartImport}
            disabled={importableCount === 0}
            aria-disabled={importableCount === 0}
          >
            Import {importableCount} Transaction{importableCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Importing Step
// ---------------------------------------------------------------------------

interface ImportingStepProps {
  progress: { current: number; total: number };
}

const ImportingStep: React.FC<ImportingStepProps> = ({ progress }) => {
  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <section aria-labelledby="importing-heading" className="import-progress">
      <h3 id="importing-heading" className="import-section-heading">
        Importing Transactions
      </h3>

      <div
        className="import-progress__bar-container"
        role="progressbar"
        aria-valuenow={progress.current}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label="Import progress"
      >
        <div className="import-progress__bar-fill" style={{ width: `${percentage}%` }} />
      </div>

      <p className="import-progress__text" aria-live="polite">
        Importing {progress.current} of {progress.total}…
      </p>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Complete Step
// ---------------------------------------------------------------------------

interface CompleteStepProps {
  summary: NonNullable<ReturnType<typeof useImport>['importSummary']>;
  onReset: () => void;
}

const CompleteStep: React.FC<CompleteStepProps> = ({ summary, onReset }) => (
  <section aria-labelledby="complete-heading" className="import-complete">
    <span className="import-complete__icon" aria-hidden="true">
      ✅
    </span>
    <h3 id="complete-heading" className="import-complete__title">
      Import Complete
    </h3>

    <div className="import-complete__stats" role="group" aria-label="Import results">
      <div className="import-preview-stat import-preview-stat--success">
        <span className="import-preview-stat__value">{summary.imported}</span>
        <span className="import-preview-stat__label">Imported</span>
      </div>
      <div className="import-preview-stat">
        <span className="import-preview-stat__value">{summary.skipped}</span>
        <span className="import-preview-stat__label">Skipped</span>
      </div>
      {summary.errors > 0 && (
        <div className="import-preview-stat import-preview-stat--errors">
          <span className="import-preview-stat__value">{summary.errors}</span>
          <span className="import-preview-stat__label">Errors</span>
        </div>
      )}
    </div>

    <div className="import-complete__actions">
      <Link to="/transactions" className="form-button form-button--primary">
        View Transactions
      </Link>
      <button type="button" className="form-button form-button--secondary" onClick={onReset}>
        Import More
      </button>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export const ImportPage: React.FC = () => {
  const importState = useImport();

  // Determine whether the mapping confirm button should be enabled.
  // At minimum, 'date' and 'amount' must be mapped, and an account selected.
  const hasMappedDate = Object.values(importState.columnMapping).includes('date');
  const hasMappedAmount = Object.values(importState.columnMapping).includes('amount');
  const canConfirmMapping =
    hasMappedDate && hasMappedAmount && importState.selectedAccountId !== null;

  return (
    <div className="import-wizard">
      <h2 className="import-wizard__title">Import Transactions</h2>

      <StepIndicator currentStep={importState.step} />

      {/* Step 1: Upload */}
      {importState.step === 'upload' && (
        <UploadStep
          onUpload={importState.uploadFile}
          uploadError={importState.uploadError}
          selectedAccountId={importState.selectedAccountId}
          onSelectAccount={importState.setSelectedAccountId}
        />
      )}

      {/* Step 2: Column Mapping */}
      {importState.step === 'mapping' && importState.parseResult !== null && (
        <MappingStep
          headers={importState.parseResult.headers}
          previewRows={importState.parseResult.rows.slice(0, MAX_PREVIEW_ROWS)}
          mappingSuggestions={importState.mappingSuggestions}
          columnMapping={importState.columnMapping}
          onSetMapping={importState.setColumnMapping}
          onConfirm={importState.confirmMapping}
          onBack={importState.goBack}
          canConfirm={canConfirmMapping}
        />
      )}

      {/* Step 3: Preview */}
      {importState.step === 'preview' && importState.validationResult !== null && (
        <PreviewStep
          validationResult={importState.validationResult}
          duplicates={importState.duplicates}
          skippedDuplicates={importState.skippedDuplicates}
          onToggleSkipDuplicate={importState.toggleSkipDuplicate}
          onSkipAllDuplicates={importState.skipAllDuplicates}
          onStartImport={importState.startImport}
          onBack={importState.goBack}
        />
      )}

      {/* Step 4: Importing */}
      {importState.step === 'importing' && <ImportingStep progress={importState.importProgress} />}

      {/* Step 5: Complete */}
      {importState.step === 'complete' && importState.importSummary !== null && (
        <CompleteStep summary={importState.importSummary} onReset={importState.reset} />
      )}
    </div>
  );
};

export default ImportPage;
