// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for the custom report builder.
 *
 * Manages report configuration with draggable fields, date range filters,
 * category/account filters, and export preview (PDF/CSV).
 *
 * Usage:
 * ```tsx
 * const { config, addField, removeField, reorderFields, generatePreview } = useReportBuilder();
 * ```
 *
 * References: issue #303
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

export type ExportFormat = 'csv' | 'pdf';

export type GroupBy = 'none' | 'category' | 'account' | 'month' | 'week';

export interface ReportConfig {
  readonly name: string;
  readonly fields: ReportField[];
  readonly startDate: LocalDate | null;
  readonly endDate: LocalDate | null;
  readonly categoryIds: SyncId[];
  readonly accountIds: SyncId[];
  readonly groupBy: GroupBy;
  readonly exportFormat: ExportFormat;
}

export interface ReportPreviewRow {
  [key: string]: string | number;
}

export interface ReportPreview {
  readonly headers: string[];
  readonly rows: ReportPreviewRow[];
  readonly totalRows: number;
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
  /** Set category filter. */
  setCategoryFilter: (categoryIds: SyncId[]) => void;
  /** Set account filter. */
  setAccountFilter: (accountIds: SyncId[]) => void;
  /** Set grouping mode. */
  setGroupBy: (groupBy: GroupBy) => void;
  /** Set export format. */
  setExportFormat: (format: ExportFormat) => void;
  /** Generate preview data. */
  generatePreview: () => void;
  /** Export the report in the selected format. Returns a data URL. */
  exportReport: () => string | null;
  /** Reset configuration to defaults. */
  resetConfig: () => void;
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
    fields: DEFAULT_FIELDS,
    startDate: null,
    endDate: null,
    categoryIds: [],
    accountIds: [],
    groupBy: 'none',
    exportFormat: 'csv',
  };
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

  return { headers, rows, totalRows: rows.length };
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
// Hook
// ---------------------------------------------------------------------------

export function useReportBuilder(): UseReportBuilderResult {
  const [config, setConfig] = useState<ReportConfig>(createDefaultConfig);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setConfig((prev) => ({ ...prev, startDate, endDate }));
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

  const setExportFormat = useCallback((exportFormat: ExportFormat) => {
    setConfig((prev) => ({ ...prev, exportFormat }));
  }, []);

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
      // PDF export would use a library — return placeholder
      return `data:application/pdf;base64,placeholder`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report.');
      return null;
    }
  }, [preview, config.exportFormat]);

  const resetConfig = useCallback(() => {
    setConfig(createDefaultConfig());
    setPreview(null);
    setError(null);
  }, []);

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
    setCategoryFilter,
    setAccountFilter,
    setGroupBy,
    setExportFormat,
    generatePreview,
    exportReport,
    resetConfig,
  };
}
