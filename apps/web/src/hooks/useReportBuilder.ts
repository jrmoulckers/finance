// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the custom report builder.
 *
 * Manages report configuration with:
 * - Report template picker (monthly summary, category breakdown, trend, custom)
 * - Date range presets + custom picker
 * - Category/account multi-select filters
 * - Chart type selection (bar, line, pie)
 * - Preview with tabular + chart data
 * - Export (PDF, CSV, email)
 * - Saved reports with localStorage persistence
 * - Scheduled report toggle
 *
 * Usage:
 * ```tsx
 * const { config, applyTemplate, generatePreview, savedReports } = useReportBuilder();
 * ```
 *
 * References: issue #303, #1113
 */

import { useCallback, useMemo, useState } from 'react';

import type { LocalDate, SyncId } from '../kmp/bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportFieldType =
  | 'date'
  | 'payee'
  | 'amount'
  | 'category'
  | 'account'
  | 'type'
  | 'note'
  | 'balance'
  | 'tags';

export interface ReportField {
  readonly id: string;
  readonly type: ReportFieldType;
  readonly label: string;
  readonly visible: boolean;
  readonly sortOrder: number;
}

export type ExportFormat = 'csv' | 'pdf' | 'email';

export type GroupBy = 'none' | 'category' | 'account' | 'month' | 'week';

export type ChartType = 'bar' | 'line' | 'pie' | 'none';

export type ReportTemplate = 'monthly-summary' | 'category-breakdown' | 'trend-analysis' | 'custom';

export type DatePreset =
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'ytd'
  | 'last-year'
  | 'custom';

export interface ReportConfig {
  readonly name: string;
  readonly template: ReportTemplate;
  readonly fields: ReportField[];
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly datePreset: DatePreset;
  readonly categoryIds: SyncId[];
  readonly accountIds: SyncId[];
  readonly groupBy: GroupBy;
  readonly chartType: ChartType;
  readonly exportFormat: ExportFormat;
  readonly isScheduled: boolean;
  readonly scheduleFrequency: 'weekly' | 'monthly' | 'quarterly';
}

export interface ReportPreviewRow {
  [key: string]: string | number;
}

/** Chart data point for Recharts rendering. */
export interface ChartDataPoint {
  readonly name: string;
  readonly value: number;
}

export interface ReportPreview {
  readonly headers: string[];
  readonly rows: ReportPreviewRow[];
  readonly totalRows: number;
  readonly chartData: ChartDataPoint[];
  readonly summary: ReportSummary;
}

/** Summary statistics for the report preview. */
export interface ReportSummary {
  readonly totalIncome: number;
  readonly totalExpenses: number;
  readonly netAmount: number;
  readonly transactionCount: number;
}

/** A saved report configuration. */
export interface SavedReport {
  readonly id: string;
  readonly name: string;
  readonly config: ReportConfig;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface UseReportBuilderResult {
  /** Current report configuration. */
  config: ReportConfig;
  /** Available fields that can be added. */
  availableFields: ReportField[];
  /** Preview data based on current configuration. */
  preview: ReportPreview | null;
  /** Whether preview is being generated. */
  generating: boolean;
  /** Error message, or null. */
  error: string | null;
  /** Update the report name. */
  setReportName: (name: string) => void;
  /** Add a field to the report. */
  addField: (fieldType: ReportFieldType) => void;
  /** Remove a field from the report. */
  removeField: (fieldId: string) => void;
  /** Reorder fields by moving a field from one index to another. */
  reorderFields: (fromIndex: number, toIndex: number) => void;
  /** Toggle field visibility. */
  toggleFieldVisibility: (fieldId: string) => void;
  /** Set date range filter. */
  setDateRange: (startDate: LocalDate | null, endDate: LocalDate | null) => void;
  /** Apply a date preset (this month, last quarter, etc.). */
  applyDatePreset: (preset: DatePreset) => void;
  /** Set category filter. */
  setCategoryFilter: (categoryIds: SyncId[]) => void;
  /** Set account filter. */
  setAccountFilter: (accountIds: SyncId[]) => void;
  /** Set grouping mode. */
  setGroupBy: (groupBy: GroupBy) => void;
  /** Set chart type for visualization. */
  setChartType: (chartType: ChartType) => void;
  /** Set export format. */
  setExportFormat: (format: ExportFormat) => void;
  /** Apply a report template (sets fields, grouping, chart type). */
  applyTemplate: (template: ReportTemplate) => void;
  /** Toggle scheduled report on/off. */
  setScheduled: (scheduled: boolean) => void;
  /** Set scheduled report frequency. */
  setScheduleFrequency: (freq: 'weekly' | 'monthly' | 'quarterly') => void;
  /** Generate preview data. */
  generatePreview: () => void;
  /** Export the report in the selected format. Returns a data URL. */
  exportReport: () => string | null;
  /** Reset configuration to defaults. */
  resetConfig: () => void;
  /** List of saved reports. */
  savedReports: SavedReport[];
  /** Save the current configuration as a named report. */
  saveReport: () => void;
  /** Load a saved report by ID. */
  loadReport: (reportId: string) => void;
  /** Delete a saved report by ID. */
  deleteSavedReport: (reportId: string) => void;
}

// ---------------------------------------------------------------------------
// Default fields
// ---------------------------------------------------------------------------

const DEFAULT_FIELDS: ReportField[] = [
  { id: 'field-date', type: 'date', label: 'Date', visible: true, sortOrder: 0 },
  { id: 'field-payee', type: 'payee', label: 'Payee', visible: true, sortOrder: 1 },
  { id: 'field-amount', type: 'amount', label: 'Amount', visible: true, sortOrder: 2 },
  { id: 'field-category', type: 'category', label: 'Category', visible: true, sortOrder: 3 },
  { id: 'field-account', type: 'account', label: 'Account', visible: true, sortOrder: 4 },
  { id: 'field-type', type: 'type', label: 'Type', visible: false, sortOrder: 5 },
  { id: 'field-note', type: 'note', label: 'Note', visible: false, sortOrder: 6 },
  { id: 'field-balance', type: 'balance', label: 'Running Balance', visible: false, sortOrder: 7 },
  { id: 'field-tags', type: 'tags', label: 'Tags', visible: false, sortOrder: 8 },
];

function createDefaultConfig(): ReportConfig {
  return {
    name: 'Custom Report',
    template: 'custom',
    fields: DEFAULT_FIELDS,
    startDate: null,
    endDate: null,
    datePreset: 'this-month',
    categoryIds: [],
    accountIds: [],
    groupBy: 'none',
    chartType: 'none',
    exportFormat: 'csv',
    isScheduled: false,
    scheduleFrequency: 'monthly',
  };
}

// ---------------------------------------------------------------------------
// Template configurations
// ---------------------------------------------------------------------------

function getTemplateConfig(template: ReportTemplate): Partial<ReportConfig> {
  switch (template) {
    case 'monthly-summary':
      return {
        name: 'Monthly Summary',
        template: 'monthly-summary',
        groupBy: 'month',
        chartType: 'bar',
        datePreset: 'this-month',
        fields: DEFAULT_FIELDS.map((f) =>
          ['date', 'payee', 'amount', 'category'].includes(f.type)
            ? { ...f, visible: true }
            : { ...f, visible: false },
        ),
      };
    case 'category-breakdown':
      return {
        name: 'Category Breakdown',
        template: 'category-breakdown',
        groupBy: 'category',
        chartType: 'pie',
        datePreset: 'this-month',
        fields: DEFAULT_FIELDS.map((f) =>
          ['category', 'amount'].includes(f.type)
            ? { ...f, visible: true }
            : { ...f, visible: false },
        ),
      };
    case 'trend-analysis':
      return {
        name: 'Trend Analysis',
        template: 'trend-analysis',
        groupBy: 'month',
        chartType: 'line',
        datePreset: 'ytd',
        fields: DEFAULT_FIELDS.map((f) =>
          ['date', 'amount', 'category'].includes(f.type)
            ? { ...f, visible: true }
            : { ...f, visible: false },
        ),
      };
    case 'custom':
    default:
      return {
        name: 'Custom Report',
        template: 'custom',
      };
  }
}

// ---------------------------------------------------------------------------
// Date preset helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDatePresetRange(preset: DatePreset): { start: string | null; end: string | null } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (preset) {
    case 'this-month':
      return {
        start: formatDate(new Date(year, month, 1)),
        end: formatDate(new Date(year, month + 1, 0)),
      };
    case 'last-month':
      return {
        start: formatDate(new Date(year, month - 1, 1)),
        end: formatDate(new Date(year, month, 0)),
      };
    case 'this-quarter': {
      const qStart = Math.floor(month / 3) * 3;
      return {
        start: formatDate(new Date(year, qStart, 1)),
        end: formatDate(new Date(year, qStart + 3, 0)),
      };
    }
    case 'last-quarter': {
      const lqStart = Math.floor(month / 3) * 3 - 3;
      return {
        start: formatDate(new Date(year, lqStart, 1)),
        end: formatDate(new Date(year, lqStart + 3, 0)),
      };
    }
    case 'ytd':
      return {
        start: formatDate(new Date(year, 0, 1)),
        end: formatDate(now),
      };
    case 'last-year':
      return {
        start: formatDate(new Date(year - 1, 0, 1)),
        end: formatDate(new Date(year - 1, 11, 31)),
      };
    case 'custom':
    default:
      return { start: null, end: null };
  }
}

// ---------------------------------------------------------------------------
// Preview generation (mock data for demonstration)
// ---------------------------------------------------------------------------

function generateMockPreview(config: ReportConfig): ReportPreview {
  const visibleFields = config.fields
    .filter((f) => f.visible)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const headers = visibleFields.map((f) => f.label);

  const sampleData = [
    {
      date: '2025-01-15',
      payee: 'Grocery Store',
      amount: -4520,
      category: 'Groceries',
      account: 'Checking',
      type: 'EXPENSE',
      note: 'Weekly shop',
      balance: 245000,
      tags: 'food',
    },
    {
      date: '2025-01-14',
      payee: 'Coffee Shop',
      amount: -450,
      category: 'Dining',
      account: 'Checking',
      type: 'EXPENSE',
      note: 'Morning coffee',
      balance: 249520,
      tags: '',
    },
    {
      date: '2025-01-13',
      payee: 'Employer Inc',
      amount: 350000,
      category: 'Salary',
      account: 'Checking',
      type: 'INCOME',
      note: 'Bi-weekly pay',
      balance: 249970,
      tags: 'income',
    },
    {
      date: '2025-01-12',
      payee: 'Electric Co',
      amount: -12500,
      category: 'Utilities',
      account: 'Checking',
      type: 'EXPENSE',
      note: 'Monthly bill',
      balance: -100030,
      tags: 'bills',
    },
    {
      date: '2025-01-11',
      payee: 'Gas Station',
      amount: -5500,
      category: 'Transportation',
      account: 'Credit Card',
      type: 'EXPENSE',
      note: 'Fill up',
      balance: -105530,
      tags: 'auto',
    },
  ];

  const fieldTypeKey: Record<ReportFieldType, string> = {
    date: 'date',
    payee: 'payee',
    amount: 'amount',
    category: 'category',
    account: 'account',
    type: 'type',
    note: 'note',
    balance: 'balance',
    tags: 'tags',
  };

  const rows: ReportPreviewRow[] = sampleData.map((row) => {
    const mapped: ReportPreviewRow = {};
    for (const field of visibleFields) {
      const key = fieldTypeKey[field.type];
      mapped[field.label] = row[key as keyof typeof row];
    }
    return mapped;
  });

  // Generate chart data grouped by category
  const chartMap = new Map<string, number>();
  for (const row of sampleData) {
    const existing = chartMap.get(row.category) ?? 0;
    chartMap.set(row.category, existing + Math.abs(row.amount));
  }
  const chartData: ChartDataPoint[] = Array.from(chartMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));

  // Summary stats
  const totalIncome = sampleData
    .filter((r) => r.type === 'INCOME')
    .reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = sampleData
    .filter((r) => r.type === 'EXPENSE')
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);

  return {
    headers,
    rows,
    totalRows: rows.length,
    chartData,
    summary: {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      transactionCount: sampleData.length,
    },
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function generateCsvExport(preview: ReportPreview): string {
  const escapeCsv = (val: string | number): string => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [preview.headers.map(escapeCsv).join(',')];

  for (const row of preview.rows) {
    const values = preview.headers.map((h) => escapeCsv(row[h] ?? ''));
    lines.push(values.join(','));
  }

  return `data:text/csv;charset=utf-8,${encodeURIComponent(lines.join('\n'))}`;
}

// ---------------------------------------------------------------------------
// Saved reports storage
// ---------------------------------------------------------------------------

const SAVED_REPORTS_KEY = 'finance-saved-reports';

function loadSavedReports(): SavedReport[] {
  try {
    const stored = localStorage.getItem(SAVED_REPORTS_KEY);
    if (stored) {
      return JSON.parse(stored) as SavedReport[];
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function persistSavedReports(reports: SavedReport[]): void {
  try {
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(reports));
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReportBuilder(): UseReportBuilderResult {
  const [config, setConfig] = useState<ReportConfig>(createDefaultConfig);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>(loadSavedReports);

  const availableFields = useMemo(() => config.fields.filter((f) => !f.visible), [config.fields]);

  const setReportName = useCallback((name: string) => {
    setConfig((prev) => ({ ...prev, name }));
  }, []);

  const addField = useCallback((fieldType: ReportFieldType) => {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.type === fieldType ? { ...f, visible: true } : f)),
    }));
  }, []);

  const removeField = useCallback((fieldId: string) => {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, visible: false } : f)),
    }));
  }, []);

  const reorderFields = useCallback((fromIndex: number, toIndex: number) => {
    setConfig((prev) => {
      const visible = prev.fields
        .filter((f) => f.visible)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const hidden = prev.fields.filter((f) => !f.visible);

      if (
        fromIndex < 0 ||
        fromIndex >= visible.length ||
        toIndex < 0 ||
        toIndex >= visible.length
      ) {
        return prev;
      }

      const reordered = [...visible];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      const updatedVisible = reordered.map((f, i) => ({ ...f, sortOrder: i }));
      const updatedHidden = hidden.map((f, i) => ({ ...f, sortOrder: updatedVisible.length + i }));

      return { ...prev, fields: [...updatedVisible, ...updatedHidden] };
    });
  }, []);

  const toggleFieldVisibility = useCallback((fieldId: string) => {
    setConfig((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.id === fieldId ? { ...f, visible: !f.visible } : f)),
    }));
  }, []);

  const setDateRange = useCallback((startDate: LocalDate | null, endDate: LocalDate | null) => {
    setConfig((prev) => ({ ...prev, startDate, endDate, datePreset: 'custom' as DatePreset }));
  }, []);

  const applyDatePreset = useCallback((preset: DatePreset) => {
    const { start, end } = getDatePresetRange(preset);
    setConfig((prev) => ({ ...prev, datePreset: preset, startDate: start, endDate: end }));
  }, []);

  const setCategoryFilter = useCallback((categoryIds: SyncId[]) => {
    setConfig((prev) => ({ ...prev, categoryIds }));
  }, []);

  const setAccountFilter = useCallback((accountIds: SyncId[]) => {
    setConfig((prev) => ({ ...prev, accountIds }));
  }, []);

  const setGroupBy = useCallback((groupBy: GroupBy) => {
    setConfig((prev) => ({ ...prev, groupBy }));
  }, []);

  const setChartType = useCallback((chartType: ChartType) => {
    setConfig((prev) => ({ ...prev, chartType }));
  }, []);

  const setExportFormat = useCallback((exportFormat: ExportFormat) => {
    setConfig((prev) => ({ ...prev, exportFormat }));
  }, []);

  const applyTemplate = useCallback((template: ReportTemplate) => {
    const templateConfig = getTemplateConfig(template);
    const { start, end } = getDatePresetRange(templateConfig.datePreset ?? 'this-month');
    setConfig((prev) => ({
      ...prev,
      ...templateConfig,
      startDate: start,
      endDate: end,
    }));
    setPreview(null);
  }, []);

  const setScheduled = useCallback((isScheduled: boolean) => {
    setConfig((prev) => ({ ...prev, isScheduled }));
  }, []);

  const setScheduleFrequency = useCallback(
    (scheduleFrequency: 'weekly' | 'monthly' | 'quarterly') => {
      setConfig((prev) => ({ ...prev, scheduleFrequency }));
    },
    [],
  );

  const generatePreview = useCallback(() => {
    setGenerating(true);
    setError(null);

    try {
      const result = generateMockPreview(config);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview.');
    } finally {
      setGenerating(false);
    }
  }, [config]);

  const exportReport = useCallback((): string | null => {
    if (!preview) {
      setError('Generate a preview first before exporting.');
      return null;
    }

    try {
      if (config.exportFormat === 'csv') {
        return generateCsvExport(preview);
      }
      if (config.exportFormat === 'email') {
        // Email export — placeholder for mailto integration
        return `mailto:?subject=${encodeURIComponent(config.name)}&body=${encodeURIComponent('Report data attached.')}`;
      }
      // PDF export would use a library — return placeholder
      return `data:application/pdf;base64,placeholder`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report.');
      return null;
    }
  }, [preview, config.exportFormat, config.name]);

  const resetConfig = useCallback(() => {
    setConfig(createDefaultConfig());
    setPreview(null);
    setError(null);
  }, []);

  const saveReport = useCallback(() => {
    const now = Date.now();
    const existing = savedReports.find((r) => r.name === config.name);

    if (existing) {
      const updated = savedReports.map((r) =>
        r.id === existing.id ? { ...r, config, updatedAt: now } : r,
      );
      setSavedReports(updated);
      persistSavedReports(updated);
    } else {
      const newReport: SavedReport = {
        id: crypto.randomUUID(),
        name: config.name,
        config,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [newReport, ...savedReports];
      setSavedReports(updated);
      persistSavedReports(updated);
    }
  }, [config, savedReports]);

  const loadReport = useCallback(
    (reportId: string) => {
      const report = savedReports.find((r) => r.id === reportId);
      if (report) {
        setConfig(report.config);
        setPreview(null);
        setError(null);
      }
    },
    [savedReports],
  );

  const deleteSavedReport = useCallback(
    (reportId: string) => {
      const updated = savedReports.filter((r) => r.id !== reportId);
      setSavedReports(updated);
      persistSavedReports(updated);
    },
    [savedReports],
  );

  return {
    config,
    availableFields,
    preview,
    generating,
    error,
    setReportName,
    addField,
    removeField,
    reorderFields,
    toggleFieldVisibility,
    setDateRange,
    applyDatePreset,
    setCategoryFilter,
    setAccountFilter,
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
  };
}
