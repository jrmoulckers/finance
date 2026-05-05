// SPDX-License-Identifier: BUSL-1.1

/**
 * Custom Report Builder page.
 *
 * Template picker, date range presets, category filters,
 * Recharts chart rendering (bar/line/pie), saved reports,
 * scheduled report toggle, PDF/CSV/email export.
 *
 * References: issue #303, #1113
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

import { useReportBuilder } from '../hooks/useReportBuilder';
import type {
  ExportFormat,
  GroupBy,
  ChartType,
  ReportTemplate,
  DatePreset,
} from '../hooks/useReportBuilder';
import { CHART_COLORS, formatChartCurrency } from '../components/charts/chart-palette';

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
  { value: 'email', label: 'Email' },
];

const CHART_OPTIONS: readonly { value: ChartType; label: string }[] = [
  { value: 'none', label: 'No Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'line', label: 'Line Chart' },
  { value: 'pie', label: 'Pie Chart' },
];

const TEMPLATE_OPTIONS: readonly { value: ReportTemplate; label: string; description: string }[] = [
  {
    value: 'monthly-summary',
    label: 'Monthly Summary',
    description: 'Overview of income and expenses by month',
  },
  {
    value: 'category-breakdown',
    label: 'Category Breakdown',
    description: 'Spending distribution across categories',
  },
  { value: 'trend-analysis', label: 'Trend Analysis', description: 'Spending trends over time' },
  { value: 'custom', label: 'Custom Report', description: 'Build your own report from scratch' },
];

const DATE_PRESET_OPTIONS: readonly { value: DatePreset; label: string }[] = [
  { value: 'this-month', label: 'This Month' },
  { value: 'last-month', label: 'Last Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'last-quarter', label: 'Last Quarter' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'last-year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
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
    applyDatePreset,
    setGroupBy,
    setChartType,
    setExportFormat,
    applyTemplate,
    setScheduled,
    setScheduleFrequency,
    generatePreview,
    exportReport,
    resetConfig,
    savedReports,
    saveReport,
    loadReport,
    deleteSavedReport,
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
      if (config.exportFormat === 'email') {
        window.open(url, '_blank');
      } else {
        setExportUrl(url);
        setTimeout(() => downloadRef.current?.click(), 100);
      }
    }
  }, [exportReport, config.exportFormat]);

  // -- Format amount for display -------------------------------------------

  const formatValue = (key: string, value: string | number): string => {
    if ((key === 'Amount' || key === 'Running Balance') && typeof value === 'number') {
      return formatChartCurrency(value, 'USD');
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
        <div className="report-builder__header-actions">
          <button
            className="report-button report-button--secondary"
            onClick={saveReport}
            aria-label="Save current report"
          >
            Save
          </button>
          <button
            className="report-button report-button--secondary"
            onClick={resetConfig}
            aria-label="Reset report configuration"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Template Picker */}
      <section className="report-card" aria-labelledby="template-title">
        <h2 id="template-title" className="report-card__title">
          Report Template
        </h2>
        <div className="report-template-grid" role="radiogroup" aria-label="Select report template">
          {TEMPLATE_OPTIONS.map((tmpl) => (
            <button
              key={tmpl.value}
              className={`report-template-card ${config.template === tmpl.value ? 'report-template-card--active' : ''}`}
              role="radio"
              aria-checked={config.template === tmpl.value}
              onClick={() => applyTemplate(tmpl.value)}
              aria-label={`${tmpl.label}: ${tmpl.description}`}
            >
              <span className="report-template-card__name">{tmpl.label}</span>
              <span className="report-template-card__desc">{tmpl.description}</span>
            </button>
          ))}
        </div>
      </section>

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

      {/* Date Range */}
      <section className="report-card" aria-labelledby="date-range-title">
        <h2 id="date-range-title" className="report-card__title">
          Date Range
        </h2>

        <div className="report-date-presets" role="group" aria-label="Date range presets">
          {DATE_PRESET_OPTIONS.map((preset) => (
            <button
              key={preset.value}
              className={`report-date-preset ${config.datePreset === preset.value ? 'report-date-preset--active' : ''}`}
              onClick={() => applyDatePreset(preset.value)}
              aria-pressed={config.datePreset === preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {config.datePreset === 'custom' && (
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
          </div>
        )}
      </section>

      {/* Filters & Chart */}
      <section className="report-card" aria-labelledby="filters-title">
        <h2 id="filters-title" className="report-card__title">
          Filters & Visualization
        </h2>

        <div className="report-filters-grid">
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
            <label htmlFor="report-chart-type" className="report-filter-group__label">
              Chart Type
            </label>
            <select
              id="report-chart-type"
              className="report-select"
              value={config.chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
            >
              {CHART_OPTIONS.map((opt) => (
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

      {/* Schedule Toggle */}
      <section className="report-card" aria-labelledby="schedule-title">
        <h2 id="schedule-title" className="report-card__title">
          Schedule
        </h2>
        <div className="report-schedule-row">
          <label className="report-toggle-label" htmlFor="report-schedule-toggle">
            <input
              id="report-schedule-toggle"
              type="checkbox"
              checked={config.isScheduled}
              onChange={(e) => setScheduled(e.target.checked)}
              className="report-toggle-input"
              aria-label="Enable scheduled report"
            />
            <span className="report-toggle-text">
              {config.isScheduled ? 'Scheduled' : 'Not Scheduled'}
            </span>
          </label>
          {config.isScheduled && (
            <select
              className="report-select report-schedule-freq"
              value={config.scheduleFrequency}
              onChange={(e) =>
                setScheduleFrequency(e.target.value as 'weekly' | 'monthly' | 'quarterly')
              }
              aria-label="Schedule frequency"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          )}
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

      {/* Chart Preview */}
      {preview && config.chartType !== 'none' && (
        <section className="report-card" aria-labelledby="chart-title">
          <h2 id="chart-title" className="report-card__title">
            Chart
          </h2>
          <div
            className="report-chart-container"
            role="figure"
            aria-label={`${config.chartType} chart of report data`}
          >
            <ReportChart chartType={config.chartType} data={preview.chartData} />
          </div>
        </section>
      )}

      {/* Summary */}
      {preview && (
        <section className="report-card" aria-labelledby="summary-title">
          <h2 id="summary-title" className="report-card__title">
            Summary
          </h2>
          <div className="report-summary-grid" role="group" aria-label="Report summary statistics">
            <div className="report-summary-stat">
              <span className="report-summary-stat__label">Income</span>
              <span className="report-summary-stat__value report-summary-stat__value--positive">
                {formatChartCurrency(preview.summary.totalIncome, 'USD')}
              </span>
            </div>
            <div className="report-summary-stat">
              <span className="report-summary-stat__label">Expenses</span>
              <span className="report-summary-stat__value report-summary-stat__value--negative">
                {formatChartCurrency(preview.summary.totalExpenses, 'USD')}
              </span>
            </div>
            <div className="report-summary-stat">
              <span className="report-summary-stat__label">Net</span>
              <span className="report-summary-stat__value">
                {formatChartCurrency(preview.summary.netAmount, 'USD')}
              </span>
            </div>
            <div className="report-summary-stat">
              <span className="report-summary-stat__label">Transactions</span>
              <span className="report-summary-stat__value">{preview.summary.transactionCount}</span>
            </div>
          </div>
        </section>
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

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <section className="report-card" aria-labelledby="saved-reports-title">
          <h2 id="saved-reports-title" className="report-card__title">
            Saved Reports
          </h2>
          <ul className="report-saved-list" role="list" aria-label="Saved reports">
            {savedReports.map((report) => (
              <li key={report.id} className="report-saved-item" role="listitem">
                <div className="report-saved-item__info">
                  <span className="report-saved-item__name">{report.name}</span>
                  <span className="report-saved-item__date">
                    {new Date(report.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="report-saved-item__actions">
                  <button
                    className="report-button report-button--secondary report-button--sm"
                    onClick={() => loadReport(report.id)}
                    aria-label={`Load report: ${report.name}`}
                  >
                    Load
                  </button>
                  <button
                    className="report-button report-button--secondary report-button--sm report-button--danger"
                    onClick={() => deleteSavedReport(report.id)}
                    aria-label={`Delete report: ${report.name}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// ReportChart sub-component (Recharts)
// ---------------------------------------------------------------------------

interface ReportChartProps {
  chartType: ChartType;
  data: readonly { name: string; value: number }[];
}

function ReportChart({ chartType, data }: ReportChartProps) {
  const currency = 'USD';

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={[...data]} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--semantic-border-default, #E5E7EB)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => formatChartCurrency(v, currency)} width={80} />
          <Tooltip formatter={(value) => formatChartCurrency(Number(value ?? 0), currency)} />
          <Bar dataKey="value">
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                role="listitem"
                aria-label={`${entry.name}: ${formatChartCurrency(entry.value, currency)}`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={[...data]} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--semantic-border-default, #E5E7EB)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => formatChartCurrency(v, currency)} width={80} />
          <Tooltip formatter={(value) => formatChartCurrency(Number(value ?? 0), currency)} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={[...data]}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                role="listitem"
                aria-label={`${entry.name}: ${formatChartCurrency(entry.value, currency)}`}
              />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatChartCurrency(Number(value ?? 0), currency)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

export default ReportBuilderPage;
