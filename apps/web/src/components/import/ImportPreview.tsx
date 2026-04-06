// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import type { UseImportResult } from '../../hooks/useImport';

export interface ImportPreviewProps {
  validationResult: NonNullable<UseImportResult['validationResult']>;
  duplicates: UseImportResult['duplicates'];
  skippedDuplicates: Set<number>;
  onToggleSkipDuplicate: (rowIndex: number) => void;
  onSkipAllDuplicates: () => void;
  onStartImport: () => void;
  onBack: () => void;
}

export const ImportPreview: React.FC<ImportPreviewProps> = ({
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
