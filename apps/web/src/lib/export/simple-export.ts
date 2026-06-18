// SPDX-License-Identifier: BUSL-1.1

import type { SqliteDb } from '../../db/sqlite-wasm';
import { getAllAccounts } from '../../db/repositories/accounts';
import { getAllBills } from '../../db/repositories/bills';
import { getAllBudgets } from '../../db/repositories/budgets';
import { getAllCategories } from '../../db/repositories/categories';
import { getAllGoals } from '../../db/repositories/goals';
import {
  getAccountSharings,
  getBudgetContributions,
  getGoalContributions,
  getHouseholdById,
  getHouseholdInvitations,
  getHouseholdMembers,
  getSharedBudgets,
  getSharedGoals,
} from '../../db/repositories/household';
import { getAllInvestments } from '../../db/repositories/investments';
import { getLotsByInvestment } from '../../db/repositories/investment-lots';
import { getAllTransactions } from '../../db/repositories/transactions';
import { buildZipArchive, type ZipEntry } from '../data-access-package';
import { getCurrentLocale } from '../i18n';

type HouseholdRecord = NonNullable<ReturnType<typeof getHouseholdById>>;

interface CsvAccountRecord {
  id: string;
  name: string;
}

interface CsvCategoryRecord {
  id: string;
  name: string;
}

interface CsvTransactionRecord {
  accountId: string;
  categoryId?: string | null;
  date: string;
  payee?: string | null;
  note?: string | null;
  statementDescription?: string | null;
  amount: { amount: number };
  currency: { code: string };
}

export type ExportRecord = Record<string, unknown>;

export interface FullJsonExportOptions {
  appVersion?: string;
  generatedAt?: Date;
  preferences?: readonly ExportRecord[];
  settings?: readonly ExportRecord[];
}

export interface FullJsonExport {
  schemaVersion: 1;
  generatedAt: string;
  appVersion: string | null;
  accounts: ReturnType<typeof getAllAccounts>;
  transactions: ReturnType<typeof getAllTransactions>;
  categories: ReturnType<typeof getAllCategories>;
  budgets: ReturnType<typeof getAllBudgets>;
  goals: ReturnType<typeof getAllGoals>;
  bills: ReturnType<typeof getAllBills>;
  investments: ReturnType<typeof getAllInvestments>;
  investmentLots: ReturnType<typeof getLotsByInvestment>;
  households: HouseholdRecord[];
  householdMembers: ReturnType<typeof getHouseholdMembers>;
  householdInvitations: ReturnType<typeof getHouseholdInvitations>;
  accountSharings: ReturnType<typeof getAccountSharings>;
  sharedBudgets: ReturnType<typeof getSharedBudgets>;
  budgetContributions: ReturnType<typeof getBudgetContributions>;
  sharedGoals: ReturnType<typeof getSharedGoals>;
  goalContributions: ReturnType<typeof getGoalContributions>;
  preferences: ExportRecord[];
  settings: ExportRecord[];
}

export interface TransactionsCsvInput {
  transactions: readonly CsvTransactionRecord[];
  accounts: readonly CsvAccountRecord[];
  categories: readonly CsvCategoryRecord[];
}

export interface ExportScopeOptions {
  readonly appVersion?: string | null;
  readonly generatedAt?: Date;
  readonly entities?: readonly (keyof FullJsonExport)[];
  readonly dateRange?: { readonly from?: string; readonly to?: string };
  readonly accountIds?: readonly string[];
  readonly categoryIds?: readonly string[];
}

export interface ExportManifest {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly appVersion: string | null;
  readonly filters: {
    readonly entities: readonly string[];
    readonly dateRange: { readonly from: string | null; readonly to: string | null };
    readonly accountIds: readonly string[];
    readonly categoryIds: readonly string[];
  };
}

export interface PdfSummaryInput extends TransactionsCsvInput {
  readonly generatedAt?: Date;
  readonly appVersion?: string | null;
  readonly dateRange?: { readonly from?: string; readonly to?: string };
  readonly accountIds?: readonly string[];
  readonly categoryIds?: readonly string[];
}

export function buildFullJsonExport(
  db: SqliteDb,
  options: FullJsonExportOptions = {},
): FullJsonExport {
  const accounts = readOptionalTable(() => getAllAccounts(db));
  const transactions = readOptionalTable(() => getAllTransactions(db));
  const categories = readOptionalTable(() => getAllCategories(db));
  const budgets = readOptionalTable(() => getAllBudgets(db));
  const goals = readOptionalTable(() => getAllGoals(db));
  const bills = readOptionalTable(() => getAllBills(db));
  const investments = readOptionalTable(() => getAllInvestments(db));
  const investmentLots = investments.flatMap((investment) =>
    readOptionalTable(() => getLotsByInvestment(db, investment.id)),
  );

  const householdIds = collectHouseholdIds([
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    bills,
    investments,
  ]);
  const households = householdIds
    .map((householdId) => readOptionalRecord(() => getHouseholdById(db, householdId)))
    .filter(isPresent);
  const householdMembers = households.flatMap((household) =>
    readOptionalTable(() => getHouseholdMembers(db, household.id)),
  );
  const householdInvitations = households.flatMap((household) =>
    readOptionalTable(() => getHouseholdInvitations(db, household.id)),
  );
  const accountSharings = households.flatMap((household) =>
    readOptionalTable(() => getAccountSharings(db, household.id)),
  );
  const sharedBudgets = households.flatMap((household) =>
    readOptionalTable(() => getSharedBudgets(db, household.id)),
  );
  const budgetContributions = sharedBudgets.flatMap((sharedBudget) =>
    readOptionalTable(() => getBudgetContributions(db, sharedBudget.id)),
  );
  const sharedGoals = households.flatMap((household) =>
    readOptionalTable(() => getSharedGoals(db, household.id)),
  );
  const goalContributions = sharedGoals.flatMap((sharedGoal) =>
    readOptionalTable(() => getGoalContributions(db, sharedGoal.id)),
  );

  return {
    schemaVersion: 1,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    appVersion: options.appVersion ?? null,
    accounts,
    transactions,
    categories,
    budgets,
    goals,
    bills,
    investments,
    investmentLots,
    households,
    householdMembers,
    householdInvitations,
    accountSharings,
    sharedBudgets,
    budgetContributions,
    sharedGoals,
    goalContributions,
    preferences: [...(options.preferences ?? [])],
    settings: [...(options.settings ?? [])],
  };
}

export function serializeFullJsonExport(exportData: FullJsonExport): string {
  return `${JSON.stringify(exportData, null, 2)}\n`;
}

export function buildTransactionsCsv(input: TransactionsCsvInput): string {
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));
  const rows = [
    ['date', 'account_name', 'category_name', 'description', 'amount', 'currency'],
    ...input.transactions.map((transaction) => {
      const account = accountsById.get(transaction.accountId);
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
      return [
        transaction.date,
        account?.name ?? '',
        category?.name ?? '',
        transaction.payee ?? transaction.note ?? transaction.statementDescription ?? '',
        formatCents(transaction.amount.amount),
        transaction.currency.code,
      ];
    }),
  ];

  return `${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
}

export function buildTransactionsCsvExport(db: SqliteDb): string {
  return buildTransactionsCsv(buildFullJsonExport(db));
}

/** A single CSV file produced by {@link buildEntityCsvFiles}. */
export interface EntityCsvFile {
  /** Filename (no path) — e.g. `transactions.csv`. */
  name: string;
  /** UTF-8 encoded CSV body, header row + data rows. */
  contents: string;
}

const FULL_EXPORT_ENTITY_KEYS = [
  'accounts',
  'transactions',
  'categories',
  'budgets',
  'goals',
  'bills',
  'investments',
  'investmentLots',
  'households',
  'householdMembers',
  'householdInvitations',
  'accountSharings',
  'sharedBudgets',
  'budgetContributions',
  'sharedGoals',
  'goalContributions',
  'preferences',
  'settings',
] as const satisfies readonly (keyof FullJsonExport)[];

/** Map camelCase JSON keys to snake_case CSV filenames for the per-entity zip. */
const CSV_FILENAMES: Record<(typeof FULL_EXPORT_ENTITY_KEYS)[number], string> = {
  accounts: 'accounts.csv',
  transactions: 'transactions.csv',
  categories: 'categories.csv',
  budgets: 'budgets.csv',
  goals: 'goals.csv',
  bills: 'bills.csv',
  investments: 'investments.csv',
  investmentLots: 'investment_lots.csv',
  households: 'households.csv',
  householdMembers: 'household_members.csv',
  householdInvitations: 'household_invitations.csv',
  accountSharings: 'account_sharings.csv',
  sharedBudgets: 'shared_budgets.csv',
  budgetContributions: 'budget_contributions.csv',
  sharedGoals: 'shared_goals.csv',
  goalContributions: 'goal_contributions.csv',
  preferences: 'preferences.csv',
  settings: 'settings.csv',
};

/**
 * Build one CSV per entity from a full JSON export. Each file always emits a
 * header row — even when the entity has no records — so the output is
 * consistent for fresh-account users.
 */
export function buildEntityCsvFiles(exportData: FullJsonExport): EntityCsvFile[] {
  return FULL_EXPORT_ENTITY_KEYS.map((key) => {
    const records = (exportData[key] as readonly unknown[] | undefined) ?? [];
    return {
      name: CSV_FILENAMES[key],
      contents: buildGenericCsv(records),
    };
  });
}

/**
 * Build a ZIP containing one CSV per entity plus a small manifest.
 * Used by the "Download all data (CSV)" action.
 */
export function buildAllCsvZip(exportData: FullJsonExport): Uint8Array {
  const encoder = new TextEncoder();
  const csvFiles = buildEntityCsvFiles(exportData);
  const manifest = buildExportManifest(exportData, { entities: [...FULL_EXPORT_ENTITY_KEYS] });
  const entries: ZipEntry[] = [
    { path: 'manifest.json', bytes: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    ...csvFiles.map((file) => ({ path: file.name, bytes: encoder.encode(file.contents) })),
  ];
  return buildZipArchive(entries);
}

export function buildExportManifest(
  exportData: Pick<FullJsonExport, 'schemaVersion' | 'generatedAt' | 'appVersion'>,
  options: ExportScopeOptions = {},
): ExportManifest {
  return {
    schemaVersion: exportData.schemaVersion,
    generatedAt: (options.generatedAt ?? new Date(exportData.generatedAt)).toISOString(),
    appVersion: options.appVersion ?? exportData.appVersion,
    filters: {
      entities: options.entities?.map(String) ?? [...FULL_EXPORT_ENTITY_KEYS],
      dateRange: { from: options.dateRange?.from ?? null, to: options.dateRange?.to ?? null },
      accountIds: [...(options.accountIds ?? [])],
      categoryIds: [...(options.categoryIds ?? [])],
    },
  };
}

export function buildXlsxWorkbook(
  exportData: FullJsonExport,
  options: ExportScopeOptions = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const entities = options.entities ?? FULL_EXPORT_ENTITY_KEYS;
  const sheets = entities.map((key, index) => ({
    key,
    name: humanizeSheetName(String(key)),
    id: index + 1,
    records: (exportData[key] as readonly unknown[] | undefined) ?? [],
  }));
  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', bytes: encoder.encode(renderXlsxContentTypes(sheets.length)) },
    { path: '_rels/.rels', bytes: encoder.encode(renderXlsxRootRels()) },
    { path: 'xl/workbook.xml', bytes: encoder.encode(renderWorkbookXml(sheets)) },
    {
      path: 'xl/_rels/workbook.xml.rels',
      bytes: encoder.encode(renderWorkbookRels(sheets.length)),
    },
    { path: 'docProps/core.xml', bytes: encoder.encode(renderCoreProperties(exportData, options)) },
    {
      path: 'docProps/app.xml',
      bytes: encoder.encode(renderAppProperties(sheets.map((sheet) => sheet.name))),
    },
    ...sheets.map((sheet) => ({
      path: `xl/worksheets/sheet${sheet.id}.xml`,
      bytes: encoder.encode(renderWorksheetXml(sheet.records)),
    })),
  ];
  return buildZipArchive(entries);
}

export function buildPdfSummary(input: PdfSummaryInput): Uint8Array {
  const generatedAt = input.generatedAt ?? new Date();
  const rows = filterTransactions(input.transactions, input);
  const totalCents = rows.reduce((sum, transaction) => sum + transaction.amount.amount, 0);
  const byAccount = new Map(input.accounts.map((account) => [account.id, account.name]));
  const lines = [
    'Finance export summary',
    `Generated: ${generatedAt.toISOString()}`,
    `App version: ${input.appVersion ?? 'unknown'}`,
    `Date range: ${input.dateRange?.from ?? 'beginning'} to ${input.dateRange?.to ?? 'end'}`,
    `Accounts: ${(input.accountIds?.map((id) => byAccount.get(id) ?? id) ?? ['all']).join(', ')}`,
    `Transactions: ${rows.length}`,
    `Net total: ${formatCents(totalCents)}`,
  ];
  return renderSimplePdf(lines);
}

/**
 * Build a CSV body for an arbitrary collection of plain objects.
 *
 * - Headers are the union of all top-level keys across rows, sorted for
 *   determinism.
 * - Nested objects and arrays are JSON-stringified into a single cell.
 * - When the collection is empty, returns the header `(empty)` so the file
 *   is still a valid CSV that downstream tools can open.
 */
export function buildGenericCsv(records: readonly unknown[]): string {
  if (records.length === 0) {
    return '(empty)\r\n';
  }

  const headers = collectHeaders(records);
  const lines: string[] = [headers.map(escapeCsvField).join(',')];
  for (const record of records) {
    const flat = isPlainRecord(record) ? flattenForCsv(record) : { value: stringify(record) };
    lines.push(headers.map((header) => escapeCsvField(flat[header] ?? '')).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function collectHeaders(records: readonly unknown[]): string[] {
  const headerSet = new Set<string>();
  for (const record of records) {
    if (!isPlainRecord(record)) {
      headerSet.add('value');
      continue;
    }
    for (const key of Object.keys(flattenForCsv(record))) {
      headerSet.add(key);
    }
  }
  return [...headerSet].sort();
}

function flattenForCsv(record: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = stringify(value);
  }
  return out;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function escapeCsvField(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildDatedExportFileName(
  prefix: string,
  extension: 'csv' | 'json' | 'zip' | 'xlsx' | 'pdf' | 'fbackup',
  generatedAt = new Date(),
): string {
  return `${prefix}-${generatedAt.toISOString().slice(0, 10)}.${extension}`;
}

function filterTransactions(
  transactions: readonly CsvTransactionRecord[],
  filters: Pick<PdfSummaryInput, 'accountIds' | 'categoryIds' | 'dateRange'>,
): CsvTransactionRecord[] {
  const accountIds = new Set(filters.accountIds ?? []);
  const categoryIds = new Set(filters.categoryIds ?? []);
  return transactions.filter((transaction) => {
    if (accountIds.size > 0 && !accountIds.has(transaction.accountId)) return false;
    if (
      categoryIds.size > 0 &&
      (!transaction.categoryId || !categoryIds.has(transaction.categoryId))
    ) {
      return false;
    }
    if (filters.dateRange?.from && transaction.date < filters.dateRange.from) return false;
    if (filters.dateRange?.to && transaction.date > filters.dateRange.to) return false;
    return true;
  });
}

function renderWorksheetXml(records: readonly unknown[]): string {
  const headers = collectHeaders(records);
  const rows =
    records.length === 0
      ? [['(empty)']]
      : [
          headers,
          ...records.map((record) => {
            const flat = isPlainRecord(record)
              ? flattenForCsv(record)
              : { value: stringify(record) };
            return headers.map((header) => flat[header] ?? '');
          }),
        ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map(
            (cell, cellIndex) =>
              `<c r="${columnName(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`,
          )
          .join('')}</row>`,
    )
    .join('')}</sheetData></worksheet>`;
}

function renderXlsxContentTypes(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheets}</Types>`;
}

function renderXlsxRootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function renderWorkbookXml(sheets: readonly { name: string; id: number }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map(
      (sheet) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`,
    )
    .join('')}</sheets></workbook>`;
}

function renderWorkbookRels(sheetCount: number): string {
  const rels = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function renderCoreProperties(exportData: FullJsonExport, options: ExportScopeOptions): string {
  const generatedAt = (options.generatedAt ?? new Date(exportData.generatedAt)).toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>Finance export</dc:title><dc:creator>Finance</dc:creator><dcterms:created>${generatedAt}</dcterms:created></cp:coreProperties>`;
}

function renderAppProperties(sheetNames: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Finance</Application><TitlesOfParts><vt:vector xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes" size="${sheetNames.length}" baseType="lpstr">${sheetNames
    .map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`)
    .join('')}</vt:vector></TitlesOfParts></Properties>`;
}

function renderSimplePdf(lines: readonly string[]): Uint8Array {
  const escapedLines = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${760 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${escapedLines.length} >> stream\n${escapedLines}\nendstream endobj`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += `${object}\n`;
  }
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join(
      '\n',
    )}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function columnName(index: number): string {
  let value = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function humanizeSheetName(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase())
    .slice(0, 31);
}

function escapeXml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/g, (match) => `\\${match}`);
}

function readOptionalTable<T>(read: () => T[]): T[] {
  try {
    return read();
  } catch (error) {
    // Always degrade gracefully: an export must not abort because a single
    // optional table or row is missing / partially populated. Missing tables
    // and stricter row-validation errors (missing required fields on
    // pre-migration rows) both surface as `Error` instances.
    logExportReadFailure(error);
    return [];
  }
}

function readOptionalRecord<T>(read: () => T | null): T | null {
  try {
    return read();
  } catch (error) {
    logExportReadFailure(error);
    return null;
  }
}

/* eslint-disable no-console -- intentional diagnostic for export read failures */
function logExportReadFailure(error: unknown): void {
  // Surface in dev so we can diagnose; never throw — the export is best-effort
  // and must always produce a downloadable artifact.
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('[export] skipping unreadable table:', error);
  }
}
/* eslint-enable no-console */

function collectHouseholdIds(
  recordGroups: readonly (readonly { householdId?: string | null }[])[],
): string[] {
  const ids = new Set<string>();
  for (const records of recordGroups) {
    for (const record of records) {
      if (record.householdId) ids.add(record.householdId);
    }
  }
  return [...ids].sort();
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat(getCurrentLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
