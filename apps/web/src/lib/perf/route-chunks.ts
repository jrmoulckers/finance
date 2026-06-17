// SPDX-License-Identifier: BUSL-1.1

export type RouteChunkName =
  | 'route-dashboard'
  | 'route-import'
  | 'route-ledger'
  | 'route-planning'
  | 'route-reports'
  | 'route-settings'
  | 'route-secondary'
  | 'vendor-ocr'
  | null;

const IMPORT_PAGES = new Set(['ImportPage', 'DataImportWizardPage', 'ReceiptOcrPage']);
const LEDGER_PAGES = new Set([
  'AccountsPage',
  'AccountDetailPage',
  'TransactionsPage',
  'TransactionDetailPage',
  'BudgetsPage',
  'BudgetDetailPage',
  'CategoriesPage',
]);
const PLANNING_PAGES = new Set([
  'BillsPage',
  'BillDetailPage',
  'CreateBillPage',
  'CashFlowPage',
  'DebtPage',
  'GoalsPage',
  'GoalDetailPage',
  'PlanningPage',
]);
const REPORT_PAGES = new Set([
  'InsightsPage',
  'ReportBuilderPage',
  'ClientProfitabilityPage',
  'InvestmentsPage',
  'InvestmentDetailPage',
  'TaxCenterPage',
  'NetWorthPage',
]);
const SECONDARY_PAGES = new Set([
  'AchievementsPage',
  'BankConnectionsPage',
  'HouseholdPage',
  'InvoicesPage',
  'PrivacyDashboardPage',
  'SafetyPage',
  'SubscriptionsPage',
  'WatchlistsPage',
]);

export function getRouteChunkName(moduleId: string): RouteChunkName {
  const normalized = normalizeModuleId(moduleId);

  if (normalized.includes('/node_modules/tesseract.js/')) return 'vendor-ocr';
  if (!normalized.includes('/src/pages/')) return null;
  if (normalized.includes('/src/pages/settings/')) return 'route-settings';

  const pageName = normalized.match(/\/src\/pages\/([^/.]+)\.(?:t|j)sx?$/)?.[1];
  if (!pageName) return null;
  if (pageName === 'DashboardPage') return 'route-dashboard';
  if (pageName === 'SettingsPage') return 'route-settings';
  if (IMPORT_PAGES.has(pageName)) return 'route-import';
  if (LEDGER_PAGES.has(pageName)) return 'route-ledger';
  if (PLANNING_PAGES.has(pageName)) return 'route-planning';
  if (REPORT_PAGES.has(pageName)) return 'route-reports';
  if (SECONDARY_PAGES.has(pageName)) return 'route-secondary';
  return null;
}

export function normalizeModuleId(moduleId: string): string {
  return moduleId.replaceAll('\\', '/');
}
