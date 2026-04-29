// SPDX-License-Identifier: BUSL-1.1

/**
 * Custom Report Builder page.
 *
 * Drag-and-drop report configuration, date range filters,
 * category/account filters, PDF/CSV export preview.
 *
 * References: issue #303
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import { useReportBuilder } from '../hooks/useReportBuilder';
import type { ExportFormat, GroupBy } from '../hooks/useReportBuilder';

import './ReportBuilderPage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROUP_OPTIONS: readonly { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'category', label: 'By Category' },
  { value: 'account', label: 'By Account' },
  { value: 'month', label: 'By Month' },
  { value: 'week', label: 'By Week' },
];

const FORMAT_OPTIONS: readonly { value: ExportFormat; label: string }[] = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportBuilderPage() {
  const {
    config,
    availableFields,
    preview,
    generating,
    error,
    setReportName,
    addField,
    removeField,
    reorderFields,
    setDateRange,
    setGroupBy,
    setExportFormat,
    generatePreview,
    exportReport,
    resetConfig,
  } = useReportBuilder();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const visibleFields = config.fields
    .filter((f) => f.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // -- Drag & Drop ---------------------------------------------------------

  const handleDragStart = useCallback((index: number) => {
    return (e: DragEvent) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
    };
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (targetIndex: number) => {
      return (_e: DragEvent) => {
        if (dragIndex !== null && dragIndex !== targetIndex) {
          reorderFields(dragIndex, targetIndex);
        }
        setDragIndex(null);
      };
    },
    [dragIndex, reorderFields],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  // -- Export --------------------------------------------------------------

  const handleExport = useCallback(() => {
    const url = exportReport();
    if (url) {
      setExportUrl(url);
      // Trigger download via hidden link
      setTimeout(() => downloadRef.current?.click(), 100);
    }
  }, [exportReport]);

  // -- Format amount for display -------------------------------------------

  const formatValue = (key: string, value: string | number): string => {
    if ((key === 'Amount' || key === 'Running Balance') && typeof value === 'number') {
      return `$${(value / 100).toFixed(2)}`;
    }
    return String(value);
  };

  return (
    <main className="report-builder" aria-labelledby="report-builder-title">
      {error && (
        <div className="report-banner--error" role="alert">
          {error}
        </div>
      )}

      <header className="report-builder__header">
        <h1 id="report-builder-title" className="report-builder__title">
          Custom Report Builder
        </h1>
        <button
          className="report-button report-button--secondary"
          onClick={resetConfig}
          aria-label="Reset report configuration"
        >
          Reset
        </button>
      </header>

      {/* Report Name */}
      <section className="report-card" aria-labelledby="report-name-label">
        <label id="report-name-label" htmlFor="report-name" className="report-card__label">
          Report Name
        </label>
        <input
          id="report-name"
          className="report-input"
          type="text"
          value={config.name}
          onChange={(e) => setReportName(e.target.value)}
          placeholder="My Custom Report"
          aria-required="true"
        />
      </section>

      {/* Field Configuration */}
      <section className="report-card" aria-labelledby="fields-title">
        <h2 id="fields-title" className="report-card__title">
          Report Fields
        </h2>
        <p className="report-card__description">
          Drag and drop to reorder. Click × to remove a field.
        </p>

        <ul
          className="report-field-list"
          role="listbox"
          aria-label="Active report fields"
          aria-orientation="vertical"
        >
          {visibleFields.map((field, index) => (
            <li
              key={field.id}
              className={`report-field-item ${dragIndex === index ? 'report-field-item--dragging' : ''}`}
              role="option"
              aria-selected="true"
              aria-label={`${field.label} field, position ${index + 1}`}
              draggable
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(index)}
              onDragEnd={handleDragEnd}
            >
              <span className="report-field-item__grip" aria-hidden="true">
                ⠿
              </span>
              <span className="report-field-item__label">{field.label}</span>
              <button
                className="report-field-item__remove"
                onClick={() => removeField(field.id)}
                aria-label={`Remove ${field.label} field`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {availableFields.length > 0 && (
          <div className="report-field-add">
            <span className="report-field-add__label">Add field:</span>
            <div className="report-field-add__options">
              {availableFields.map((field) => (
                <button
                  key={field.id}
                  className="report-chip"
                  onClick={() => addField(field.type)}
                  aria-label={`Add ${field.label} field`}
                >
                  + {field.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="report-card" aria-labelledby="filters-title">
        <h2 id="filters-title" className="report-card__title">
          Filters
        </h2>

        <div className="report-filters-grid">
          <div className="report-filter-group">
            <label htmlFor="report-start-date" className="report-filter-group__label">
              Start Date
            </label>
            <input
              id="report-start-date"
              className="report-input"
              type="date"
              value={config.startDate ?? ''}
              onChange={(e) => setDateRange(e.target.value || null, config.endDate)}
            />
          </div>

          <div className="report-filter-group">
            <label htmlFor="report-end-date" className="report-filter-group__label">
              End Date
            </label>
            <input
              id="report-end-date"
              className="report-input"
              type="date"
              value={config.endDate ?? ''}
              onChange={(e) => setDateRange(config.startDate, e.target.value || null)}
            />
          </div>

          <div className="report-filter-group">
            <label htmlFor="report-group-by" className="report-filter-group__label">
              Group By
            </label>
            <select
              id="report-group-by"
              className="report-select"
              value={config.groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            >
              {GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="report-filter-group">
            <label htmlFor="report-format" className="report-filter-group__label">
              Export Format
            </label>
            <select
              id="report-format"
              className="report-select"
              value={config.exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="report-actions">
        <button
          className="report-button report-button--primary"
          onClick={generatePreview}
          disabled={generating}
          aria-busy={generating}
        >
          {generating ? 'Generating…' : 'Generate Preview'}
        </button>
        {preview && (
          <button
            className="report-button report-button--secondary"
            onClick={handleExport}
            aria-label={`Export as ${config.exportFormat.toUpperCase()}`}
          >
            Export {config.exportFormat.toUpperCase()}
          </button>
        )}
      </div>

      {/* Hidden download link */}
      {exportUrl && (
        <a
          ref={downloadRef}
          href={exportUrl}
          download={`${config.name}.${config.exportFormat}`}
          className="report-hidden"
          aria-hidden="true"
          tabIndex={-1}
        >
          Download
        </a>
      )}

      {/* Preview Table */}
      {preview && (
        <section className="report-card" aria-labelledby="preview-title">
          <h2 id="preview-title" className="report-card__title">
            Preview ({preview.totalRows} rows)
          </h2>
          <div
            className="report-table-wrapper"
            role="region"
            aria-label="Report preview"
            tabIndex={0}
          >
            <table className="report-table" aria-label="Report data preview">
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header} scope="col">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i}>
                    {preview.headers.map((header) => (
                      <td key={header}>{formatValue(header, row[header] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

export default ReportBuilderPage;
