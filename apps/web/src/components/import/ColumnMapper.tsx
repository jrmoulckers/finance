// SPDX-License-Identifier: BUSL-1.1

/**
 * Column mapping table for the CSV import wizard.
 *
 * Displays each CSV column header alongside a dropdown to map it to a
 * transaction field, a confidence indicator from auto-detection, and
 * a preview of the first few values from the data rows.
 *
 * Accessibility:
 *   - Table with proper scope="col" headers
 *   - Each dropdown has an aria-label identifying the column
 */

import React, { useCallback } from 'react';

import type {
  ColumnMapping,
  MappingSuggestion,
  TransactionField,
} from '../../lib/csv-column-mapper';

/** Available transaction fields for mapping dropdowns. */
export const TRANSACTION_FIELDS: { value: TransactionField | ''; label: string }[] = [
  { value: '', label: '\u2014 Unmapped \u2014' },
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

export interface ColumnMapperProps {
  headers: string[];
  previewRows: string[][];
  mappingSuggestions: Pick<MappingSuggestion, 'columnIndex' | 'suggestedField' | 'confidence'>[];
  columnMapping: ColumnMapping;
  onSetMapping: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onBack: () => void;
  canConfirm: boolean;
}

export const ColumnMapper: React.FC<ColumnMapperProps> = ({
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
                        {'\u2014'}
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
