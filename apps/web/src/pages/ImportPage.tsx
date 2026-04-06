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
 *
 * Components are extracted into `components/import/` for reusability and
 * testability. This page composes them via the `useImport` hook.
 */

import React, { useId } from 'react';

import {
  ColumnMapper,
  FileDropZone,
  ImportComplete,
  ImportPreview,
  ImportProgress,
  StepIndicator,
} from '../components/import';
import { useAccounts } from '../hooks/useAccounts';
import { useImport } from '../hooks/useImport';

import '../styles/import.css';

// ---------------------------------------------------------------------------
// Upload Step (page-specific: combines FileDropZone + account selector)
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
  const accountSelectId = useId();
  const { accounts, loading: accountsLoading } = useAccounts();

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

      <FileDropZone
        accept=".csv"
        onFile={onUpload}
        inputLabel="Choose CSV file to import"
        hint=".csv files up to 10 MB"
      />

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
// Main Page Component
// ---------------------------------------------------------------------------

const MAX_PREVIEW_ROWS = 3;

export const ImportPage: React.FC = () => {
  const importState = useImport();

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
        <ColumnMapper
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
        <ImportPreview
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
      {importState.step === 'importing' && <ImportProgress progress={importState.importProgress} />}

      {/* Step 5: Complete */}
      {importState.step === 'complete' && importState.importSummary !== null && (
        <ImportComplete summary={importState.importSummary} onReset={importState.reset} />
      )}
    </div>
  );
};

export default ImportPage;
