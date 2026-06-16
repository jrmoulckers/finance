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

import type { Account, Category, LocalDate, SyncId, Transaction } from '../kmp/bridge';
import {
  generateBalanceSheet,
  generateCashFlow,
  generateProfitAndLoss,
  type BalanceSheetReport,
  type CashFlowReport,
  type ProfitAndLossReport,
} from '../lib/reports/financial-statements';
import {
  buildCategoryDrillDown,
  detectReportAnomalies,
  filterTransactionsForReport,
  type AnomalyModule,
  type AnomalyStatus,
  type CategoryDrillDown,
  type ReportAnomaly,
} from '../lib/reports/reporting-beta';
import { useAccounts } from './useAccounts';
import { useCategories } from './useCategories';
import { useTransactions } from './useTransactions';

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

export type ReportTemplate =
  | 'profit-and-loss'
  | 'cash-flow'
  | 'balance-sheet'
  | 'monthly-summary'
  | 'category-breakdown'
  | 'trend-analysis'
  | 'custom';

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
  readonly anomalyModules: AnomalyModule[];
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
  readonly schemaVersion: number;
}

export interface UseReportBuilderResult {
  /** Current report configuration. */
  config: ReportConfig;
  /** Available fields that can be added. */
  availableFields: ReportField[];
  /** Categories available for filters. */
  availableCategories: Category[];
  /** Accounts available for filters. */
  availableAccounts: Account[];
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
  /** Toggle reusable anomaly modules for saved templates. */
  toggleAnomalyModule: (module: AnomalyModule) => void;
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
  /** Duplicate a saved report template. */
  duplicateSavedReport: (reportId: string) => void;
  /** Rename a saved report template. */
  renameSavedReport: (reportId: string, name: string) => void;
  /** Drill-down for chart categories in the current preview. */
  getCategoryDrillDown: (categoryName: string) => CategoryDrillDown | null;
  /** Anomalies generated by enabled modules. */
  anomalies: ReportAnomaly[];
  /** Mark anomaly workflow status. */
  markAnomaly: (anomalyId: string, status: AnomalyStatus) => void;
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
    anomalyModules: [],
  };
}

// ---------------------------------------------------------------------------
// Template configurations
// ---------------------------------------------------------------------------

function getTemplateConfig(template: ReportTemplate): Partial<ReportConfig> {
  switch (template) {
    case 'profit-and-loss':
      return {
        name: 'Profit & Loss',
        template: 'profit-and-loss',
        groupBy: 'category',
        chartType: 'bar',
        datePreset: 'this-month',
        fields: DEFAULT_FIELDS.map((f) =>
          ['category', 'type', 'amount'].includes(f.type)
            ? { ...f, visible: true }
            : { ...f, visible: false },
        ),
      };
    case 'cash-flow':
      return {
        name: 'Cash Flow Statement',
        template: 'cash-flow',
        groupBy: 'category',
        chartType: 'bar',
        datePreset: 'this-month',
        fields: DEFAULT_FIELDS.map((f) =>
          ['category', 'amount', 'type'].includes(f.type)
            ? { ...f, visible: true }
            : { ...f, visible: false },
        ),
      };
    case 'balance-sheet':
      return {
        name: 'Balance Sheet',
        template: 'balance-sheet',
        groupBy: 'account',
        chartType: 'bar',
        datePreset: 'custom',
        fields: DEFAULT_FIELDS.map((f) =>
          ['account', 'type', 'balance'].includes(f.type)
            ? { ...f, visible: true }
            : { ...f, visible: false },
        ),
      };
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
// Preview generation from real user data
// ---------------------------------------------------------------------------

function profitAndLossPreview(report: ProfitAndLossReport): ReportPreview {
  const headers = ['Section', 'Category', 'Amount', 'Transactions'];
  const rows: ReportPreviewRow[] = [
    ...report.income.map((line) => ({
      Section: 'Income',
      Category: line.label,
      Amount: line.amount,
      Transactions: line.transactionCount,
    })),
    { Section: 'Income', Category: 'Total Income', Amount: report.totalIncome, Transactions: '' },
    ...report.expenses.map((line) => ({
      Section: 'Expenses',
      Category: line.label,
      Amount: line.amount,
      Transactions: line.transactionCount,
    })),
    {
      Section: 'Expenses',
      Category: 'Total Expenses',
      Amount: report.totalExpenses,
      Transactions: '',
    },
    {
      Section: 'Net Income',
      Category: 'Income minus expenses',
      Amount: report.netIncome,
      Transactions: '',
    },
  ];

  return {
    headers,
    rows,
    totalRows: rows.length,
    chartData: [
      ...report.income.map((line) => ({ name: `Income: ${line.label}`, value: line.amount })),
      ...report.expenses.map((line) => ({ name: `Expense: ${line.label}`, value: line.amount })),
    ],
    summary: {
      totalIncome: report.totalIncome,
      totalExpenses: report.totalExpenses,
      netAmount: report.netIncome,
      transactionCount: report.transactionCount,
    },
  };
}

function cashFlowPreview(report: CashFlowReport): ReportPreview {
  const headers = ['Section', 'Group', 'Category', 'Amount', 'Transactions'];
  const rows: ReportPreviewRow[] = [
    ...report.inflows.map((line) => ({
      Section: 'Inflows',
      Group: line.group,
      Category: line.label,
      Amount: line.amount,
      Transactions: line.transactionCount,
    })),
    {
      Section: 'Inflows',
      Group: '',
      Category: 'Total Inflows',
      Amount: report.totalInflows,
      Transactions: '',
    },
    ...report.outflows.map((line) => ({
      Section: 'Outflows',
      Group: line.group,
      Category: line.label,
      Amount: line.amount,
      Transactions: line.transactionCount,
    })),
    {
      Section: 'Outflows',
      Group: '',
      Category: 'Total Outflows',
      Amount: report.totalOutflows,
      Transactions: '',
    },
    {
      Section: 'Net Change in Cash',
      Group: '',
      Category: 'Inflows minus outflows',
      Amount: report.netChangeInCash,
      Transactions: '',
    },
  ];

  return {
    headers,
    rows,
    totalRows: rows.length,
    chartData: [
      ...report.inflows.map((line) => ({ name: `Inflow: ${line.label}`, value: line.amount })),
      ...report.outflows.map((line) => ({ name: `Outflow: ${line.label}`, value: line.amount })),
    ],
    summary: {
      totalIncome: report.totalInflows,
      totalExpenses: report.totalOutflows,
      netAmount: report.netChangeInCash,
      transactionCount: report.transactionCount,
    },
  };
}

function balanceSheetPreview(report: BalanceSheetReport): ReportPreview {
  const headers = ['Section', 'Account', 'Type', 'Amount'];
  const rows: ReportPreviewRow[] = [
    ...report.assets.map((line) => ({
      Section: 'Assets',
      Account: line.label,
      Type: line.accountType,
      Amount: line.amount,
    })),
    { Section: 'Assets', Account: 'Total Assets', Type: '', Amount: report.totalAssets },
    ...report.liabilities.map((line) => ({
      Section: 'Liabilities',
      Account: line.label,
      Type: line.accountType,
      Amount: line.amount,
    })),
    {
      Section: 'Liabilities',
      Account: 'Total Liabilities',
      Type: '',
      Amount: report.totalLiabilities,
    },
    {
      Section: 'Net Worth',
      Account: 'Assets minus liabilities',
      Type: '',
      Amount: report.netWorth,
    },
  ];

  return {
    headers,
    rows,
    totalRows: rows.length,
    chartData: [
      { name: 'Assets', value: report.totalAssets },
      { name: 'Liabilities', value: report.totalLiabilities },
      { name: 'Net Worth', value: report.netWorth },
    ],
    summary: {
      totalIncome: report.totalAssets,
      totalExpenses: report.totalLiabilities,
      netAmount: report.netWorth,
      transactionCount: report.accountCount,
    },
  };
}

function signedAmount(tx: Transaction): number {
  if (tx.type === 'EXPENSE') return -Math.abs(tx.amount.amount);
  if (tx.type === 'INCOME') return Math.abs(tx.amount.amount);
  return tx.amount.amount;
}

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return formatDate(start);
}

function transactionFieldValue(
  field: ReportField,
  tx: Transaction,
  accountMap: ReadonlyMap<string, Account>,
  categoryMap: ReadonlyMap<string, Category>,
): string | number {
  switch (field.type) {
    case 'date':
      return tx.date;
    case 'payee':
      return tx.payee ?? tx.counterpartyName ?? '';
    case 'amount':
      return signedAmount(tx);
    case 'category':
      return tx.categoryId ? (categoryMap.get(tx.categoryId)?.name ?? 'Unknown') : 'Uncategorized';
    case 'account':
      return accountMap.get(tx.accountId)?.name ?? 'Unknown account';
    case 'type':
      return tx.type;
    case 'note':
      return tx.note ?? tx.extraNotes ?? '';
    case 'balance':
      return '';
    case 'tags':
      return tx.tags.join(', ');
  }
}

function customTransactionPreview(
  config: ReportConfig,
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
): ReportPreview {
  const filtered = filterTransactionsForReport(transactions, config).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const visibleFields = config.fields.filter((field) => field.visible).sort((a, b) => a.sortOrder - b.sortOrder);

  let headers: string[];
  let rows: ReportPreviewRow[];
  let chartData: ChartDataPoint[];

  if (config.groupBy === 'none') {
    headers = visibleFields.map((field) => field.label);
    rows = filtered.map((tx) =>
      Object.fromEntries(
        visibleFields.map((field) => [field.label, transactionFieldValue(field, tx, accountMap, categoryMap)]),
      ),
    ) as ReportPreviewRow[];
    chartData = rows.map((row, index) => ({
      name: String(row.Payee ?? row.Date ?? `Row ${index + 1}`),
      value: Math.abs(Number(row.Amount ?? 0)),
    }));
  } else {
    headers = ['Group', 'Income', 'Expenses', 'Net Amount', 'Transactions'];
    const groups = new Map<string, { income: number; expenses: number; count: number }>();
    for (const tx of filtered) {
      const group =
        config.groupBy === 'category'
          ? tx.categoryId
            ? (categoryMap.get(tx.categoryId)?.name ?? 'Unknown')
            : 'Uncategorized'
          : config.groupBy === 'account'
            ? (accountMap.get(tx.accountId)?.name ?? 'Unknown account')
            : config.groupBy === 'month'
              ? tx.date.slice(0, 7)
              : weekKey(tx.date);
      const existing = groups.get(group) ?? { income: 0, expenses: 0, count: 0 };
      if (tx.type === 'INCOME') existing.income += Math.abs(tx.amount.amount);
      if (tx.type === 'EXPENSE') existing.expenses += Math.abs(tx.amount.amount);
      existing.count += 1;
      groups.set(group, existing);
    }
    rows = Array.from(groups.entries())
      .map(([group, value]) => ({
        Group: group,
        Income: value.income,
        Expenses: value.expenses,
        'Net Amount': value.income - value.expenses,
        Transactions: value.count,
      }))
      .sort((a, b) => String(a.Group).localeCompare(String(b.Group)));
    chartData = rows.map((row) => ({ name: String(row.Group), value: Math.abs(Number(row.Expenses || row.Income || 0)) }));
  }

  const totalIncome = filtered
    .filter((tx) => tx.type === 'INCOME')
    .reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0);
  const totalExpenses = filtered
    .filter((tx) => tx.type === 'EXPENSE')
    .reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0);

  return {
    headers,
    rows,
    totalRows: rows.length,
    chartData,
    summary: {
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      transactionCount: filtered.length,
    },
  };
}

function generateRealPreview(
  config: ReportConfig,
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
): ReportPreview {
  if (config.template === 'balance-sheet') {
    return balanceSheetPreview(
      generateBalanceSheet(accounts, transactions, { asOfDate: config.endDate ?? undefined }),
    );
  }

  const periodOptions = {
    startDate: config.startDate ?? undefined,
    endDate: config.endDate ?? undefined,
    categoryIds: config.categoryIds,
    accountIds: config.accountIds,
  };

  if (config.template === 'cash-flow') {
    return cashFlowPreview(generateCashFlow(transactions, accounts, categories, periodOptions));
  }

  if (config.template === 'profit-and-loss') {
    return profitAndLossPreview(generateProfitAndLoss(transactions, categories, periodOptions));
  }

  return customTransactionPreview(config, transactions, accounts, categories);
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
const ANOMALY_STATUS_KEY = 'finance-report-anomaly-status';
const SAVED_REPORTS_SCHEMA_VERSION = 2;

function normalizeSavedReport(report: SavedReport): SavedReport {
  return {
    ...report,
    schemaVersion: report.schemaVersion ?? SAVED_REPORTS_SCHEMA_VERSION,
    config: {
      ...createDefaultConfig(),
      ...report.config,
      anomalyModules: report.config.anomalyModules ?? [],
    },
  };
}

function loadSavedReports(): SavedReport[] {
  try {
    const stored = localStorage.getItem(SAVED_REPORTS_KEY);
    if (stored) {
      return (JSON.parse(stored) as SavedReport[]).map(normalizeSavedReport);
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

function loadAnomalyStatuses(): Record<string, AnomalyStatus> {
  try {
    const stored = localStorage.getItem(ANOMALY_STATUS_KEY);
    return stored ? (JSON.parse(stored) as Record<string, AnomalyStatus>) : {};
  } catch {
    return {};
  }
}

function persistAnomalyStatuses(statuses: Record<string, AnomalyStatus>): void {
  try {
    localStorage.setItem(ANOMALY_STATUS_KEY, JSON.stringify(statuses));
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
  const [anomalyStatuses, setAnomalyStatuses] = useState<Record<string, AnomalyStatus>>(loadAnomalyStatuses);

  const { transactions, error: transactionsError } = useTransactions();
  const { accounts, error: accountsError } = useAccounts();
  const { categories, error: categoriesError } = useCategories();

  const availableFields = useMemo(() => config.fields.filter((f) => !f.visible), [config.fields]);
  const availableCategories = useMemo(() => categories.filter((category) => !category.deletedAt), [categories]);
  const availableAccounts = useMemo(() => accounts.filter((account) => !account.isArchived), [accounts]);
  const anomalies = useMemo(
    () =>
      detectReportAnomalies(
        filterTransactionsForReport(transactions, config),
        categories,
        accounts,
        config.anomalyModules,
        new Date(),
        anomalyStatuses,
      ),
    [accounts, anomalyStatuses, categories, config, transactions],
  );

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

  const toggleAnomalyModule = useCallback((module: AnomalyModule) => {
    setConfig((prev) => ({
      ...prev,
      anomalyModules: prev.anomalyModules.includes(module)
        ? prev.anomalyModules.filter((enabled) => enabled !== module)
        : [...prev.anomalyModules, module],
    }));
  }, []);

  const generatePreview = useCallback(() => {
    setGenerating(true);
    setError(null);

    try {
      const dataError = transactionsError ?? accountsError ?? categoriesError;
      if (dataError) {
        throw new Error(dataError);
      }

      const result = generateRealPreview(config, transactions, accounts, categories);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview.');
    } finally {
      setGenerating(false);
    }
  }, [
    accounts,
    accountsError,
    categories,
    categoriesError,
    config,
    transactions,
    transactionsError,
  ]);

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
        schemaVersion: SAVED_REPORTS_SCHEMA_VERSION,
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

  const duplicateSavedReport = useCallback(
    (reportId: string) => {
      const source = savedReports.find((r) => r.id === reportId);
      if (!source) return;
      const now = Date.now();
      const copy: SavedReport = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        config: { ...source.config, name: `${source.config.name} Copy` },
        createdAt: now,
        updatedAt: now,
        schemaVersion: SAVED_REPORTS_SCHEMA_VERSION,
      };
      const updated = [copy, ...savedReports];
      setSavedReports(updated);
      persistSavedReports(updated);
    },
    [savedReports],
  );

  const renameSavedReport = useCallback(
    (reportId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const now = Date.now();
      const updated = savedReports.map((report) =>
        report.id === reportId
          ? { ...report, name: trimmed, config: { ...report.config, name: trimmed }, updatedAt: now }
          : report,
      );
      setSavedReports(updated);
      persistSavedReports(updated);
    },
    [savedReports],
  );

  const getCategoryDrillDown = useCallback(
    (categoryName: string): CategoryDrillDown | null => {
      const normalizedName = categoryName.replace(/^(Income|Expense|Inflow|Outflow):\s*/, '');
      const category = categories.find((item) => item.name === normalizedName);
      const categoryId = normalizedName === 'Uncategorized' ? null : (category?.id ?? null);
      if (!category && normalizedName !== 'Uncategorized') return null;
      return buildCategoryDrillDown(transactions, categories, accounts, {
        startDate: config.startDate,
        endDate: config.endDate,
        accountIds: config.accountIds,
        categoryIds: categoryId ? [categoryId] : [],
        categoryId,
      });
    },
    [accounts, categories, config.accountIds, config.endDate, config.startDate, transactions],
  );

  const markAnomaly = useCallback((anomalyId: string, status: AnomalyStatus) => {
    setAnomalyStatuses((prev) => {
      const updated = { ...prev, [anomalyId]: status };
      persistAnomalyStatuses(updated);
      return updated;
    });
  }, []);

  return {
    config,
    availableFields,
    availableCategories,
    availableAccounts,
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
    toggleAnomalyModule,
    generatePreview,
    exportReport,
    resetConfig,
    savedReports,
    saveReport,
    loadReport,
    deleteSavedReport,
    duplicateSavedReport,
    renameSavedReport,
    getCategoryDrillDown,
    anomalies,
    markAnomaly,
  };
}
