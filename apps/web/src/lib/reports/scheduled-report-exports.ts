// SPDX-License-Identifier: BUSL-1.1

import type { LocalDate } from '../../kmp/bridge';

export type ScheduledReportFrequency = 'weekly' | 'monthly' | 'quarterly';
export type ScheduledReportExportFormat = 'csv' | 'html';

export interface ReportExportTable {
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, string | number | boolean | null | undefined>>[];
  readonly summary?: Readonly<Record<string, string | number | boolean | null | undefined>>;
}

export interface ScheduledReportConfig {
  readonly id: string;
  readonly reportName: string;
  readonly frequency: ScheduledReportFrequency;
  readonly anchorDate: LocalDate;
  readonly lastRunDate?: LocalDate | null;
  readonly paused?: boolean;
  readonly exportFormats: readonly ScheduledReportExportFormat[];
  readonly recipients?: readonly string[];
}

export interface ScheduledReportRunPreview {
  readonly reportId: string;
  readonly reportName: string;
  readonly isPaused: boolean;
  readonly nextRunDate: LocalDate | null;
  readonly frequencyLabel: string;
  readonly deliveryMode: 'export-only' | 'email-ready' | 'paused';
  readonly deferredCapabilities: readonly string[];
}

export interface ScheduledReportExportPackage {
  readonly reportId: string;
  readonly reportName: string;
  readonly generatedAt: string;
  readonly nextRunDate: LocalDate | null;
  readonly htmlSummary: string;
  readonly csvAttachment?: {
    readonly filename: string;
    readonly mimeType: 'text/csv';
    readonly content: string;
  };
  readonly metadata: {
    readonly rowCount: number;
    readonly containsSensitiveUrlData: false;
    readonly emailDeliveryDeferred: boolean;
  };
}

const FREQUENCY_LABELS: Record<ScheduledReportFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

function parseLocalDate(value: LocalDate): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatLocalDate(date: Date): LocalDate {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsClamped(date: Date, months: number, anchorDay: number): Date {
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + months;
  const firstOfTarget = new Date(Date.UTC(targetYear, targetMonth, 1));
  const clampedDay = Math.min(
    anchorDay,
    daysInMonth(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth()),
  );
  return new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), clampedDay),
  );
}

function addFrequency(date: Date, frequency: ScheduledReportFrequency, anchorDay: number): Date {
  if (frequency === 'weekly') {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  return addMonthsClamped(date, frequency === 'monthly' ? 1 : 3, anchorDay);
}

export function calculateNextScheduledRun(
  config: Pick<ScheduledReportConfig, 'frequency' | 'anchorDate' | 'lastRunDate' | 'paused'>,
  asOfDate: LocalDate = formatLocalDate(new Date()),
): LocalDate | null {
  if (config.paused) return null;

  const anchor = parseLocalDate(config.anchorDate);
  const anchorDay = anchor.getUTCDate();
  const asOf = parseLocalDate(asOfDate);
  let candidate = config.lastRunDate
    ? addFrequency(parseLocalDate(config.lastRunDate), config.frequency, anchorDay)
    : anchor;

  while (candidate.getTime() <= asOf.getTime()) {
    candidate = addFrequency(candidate, config.frequency, anchorDay);
  }

  return formatLocalDate(candidate);
}

export function buildScheduledReportRunPreview(
  config: ScheduledReportConfig,
  asOfDate?: LocalDate,
): ScheduledReportRunPreview {
  const nextRunDate = calculateNextScheduledRun(config, asOfDate);
  const emailSelected = config.recipients !== undefined && config.recipients.length > 0;

  return {
    reportId: config.id,
    reportName: config.reportName,
    isPaused: config.paused === true,
    nextRunDate,
    frequencyLabel: FREQUENCY_LABELS[config.frequency],
    deliveryMode: config.paused ? 'paused' : emailSelected ? 'email-ready' : 'export-only',
    deferredCapabilities: emailSelected
      ? [
          'Server-side scheduler, encrypted report rendering, and transactional email delivery are deferred to backend/email infrastructure.',
        ]
      : [],
  };
}

function escapeCsvValue(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReportCsv(table: ReportExportTable): string {
  const lines = [table.headers.map(escapeCsvValue).join(',')];
  for (const row of table.rows) {
    lines.push(table.headers.map((header) => escapeCsvValue(row[header])).join(','));
  }
  return lines.join('\n');
}

function escapeHtml(value: string | number | boolean | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileSafeName(reportName: string): string {
  const normalized = reportName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'scheduled-report';
}

export function buildReportHtmlSummary(
  reportName: string,
  table: ReportExportTable,
  generatedAt: string,
  maxPreviewRows = 5,
): string {
  const summaryRows = Object.entries(table.summary ?? {})
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join('');
  const previewRows = table.rows
    .slice(0, maxPreviewRows)
    .map(
      (row) =>
        `<tr>${table.headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`,
    )
    .join('');

  return [
    '<!doctype html>',
    '<html><body>',
    `<h1>${escapeHtml(reportName)}</h1>`,
    `<p>Generated ${escapeHtml(generatedAt)}. This summary is based on recorded local report data.</p>`,
    summaryRows ? `<ul>${summaryRows}</ul>` : '',
    '<table>',
    `<thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`,
    `<tbody>${previewRows}</tbody>`,
    '</table>',
    '<p>CSV export is attached/generated separately; no financial values are placed in URLs.</p>',
    '</body></html>',
  ].join('');
}

export function buildScheduledReportExportPackage(
  config: ScheduledReportConfig,
  table: ReportExportTable,
  generatedAt = new Date().toISOString(),
  asOfDate?: LocalDate,
): ScheduledReportExportPackage {
  const includeCsv = config.exportFormats.includes('csv');
  const csvContent = includeCsv ? buildReportCsv(table) : undefined;
  const runPreview = buildScheduledReportRunPreview(config, asOfDate);

  return {
    reportId: config.id,
    reportName: config.reportName,
    generatedAt,
    nextRunDate: runPreview.nextRunDate,
    htmlSummary: buildReportHtmlSummary(config.reportName, table, generatedAt),
    csvAttachment: csvContent
      ? {
          filename: `${fileSafeName(config.reportName)}-${generatedAt.slice(0, 10)}.csv`,
          mimeType: 'text/csv',
          content: csvContent,
        }
      : undefined,
    metadata: {
      rowCount: table.rows.length,
      containsSensitiveUrlData: false,
      emailDeliveryDeferred: (config.recipients?.length ?? 0) > 0,
    },
  };
}
