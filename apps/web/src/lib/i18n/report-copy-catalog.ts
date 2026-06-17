// SPDX-License-Identifier: BUSL-1.1

export type ReportCopyId =
  | 'dashboard.cashFlow.title'
  | 'dashboard.netWorth.title'
  | 'reports.monthly.heading'
  | 'reports.emptyState'
  | 'charts.spendingTrend.label'
  | 'charts.spendingTrend.aria'
  | 'charts.category.tooltip'
  | 'charts.budgetDonut.aria';

export interface ReportCopyMessage {
  readonly id: ReportCopyId;
  readonly defaultMessage: string;
  readonly translatorNote: string;
}

export type ReportCopyCatalog = Partial<Record<ReportCopyId, string>>;

export interface ResolvedReportCopy {
  readonly id: ReportCopyId;
  readonly text: string;
  readonly translated: boolean;
  readonly translatorNote: string;
}

export const REPORT_COPY_MESSAGES: readonly ReportCopyMessage[] = [
  {
    id: 'dashboard.cashFlow.title',
    defaultMessage: 'Cash flow',
    translatorNote: 'Dashboard card title for income minus expenses.',
  },
  {
    id: 'dashboard.netWorth.title',
    defaultMessage: 'Net worth',
    translatorNote: 'Dashboard card title for assets minus liabilities.',
  },
  {
    id: 'reports.monthly.heading',
    defaultMessage: 'Monthly report for {dateRange}',
    translatorNote: 'Report heading. {dateRange} is a localized month or date range.',
  },
  {
    id: 'reports.emptyState',
    defaultMessage: 'No report data is available for this period.',
    translatorNote: 'Empty state shown when filters return no report rows.',
  },
  {
    id: 'charts.spendingTrend.label',
    defaultMessage: 'Spending trend',
    translatorNote: 'Visible label for a chart of spending over time.',
  },
  {
    id: 'charts.spendingTrend.aria',
    defaultMessage: 'Spending trend chart for {dateRange}',
    translatorNote: 'Screen-reader chart description. {dateRange} is localized before insertion.',
  },
  {
    id: 'charts.category.tooltip',
    defaultMessage: '{categoryName}: {value}',
    translatorNote: '{categoryName} is a user category; {value} is already formatted with Intl currency utilities.',
  },
  {
    id: 'charts.budgetDonut.aria',
    defaultMessage: 'Budget chart for {accountName}',
    translatorNote: '{accountName} is the user-visible account or budget name.',
  },
];

const messagesById = new Map(REPORT_COPY_MESSAGES.map((message) => [message.id, message]));

function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => String(values[key] ?? `{${key}}`));
}

export function resolveReportCopy(params: {
  readonly id: ReportCopyId;
  readonly catalog?: ReportCopyCatalog;
  readonly values?: Readonly<Record<string, string | number>>;
}): ResolvedReportCopy {
  const message = messagesById.get(params.id);
  if (!message) throw new Error(`Unknown report copy id: ${params.id}`);
  const translatedTemplate = params.catalog?.[params.id];
  const template = translatedTemplate ?? message.defaultMessage;
  return {
    id: params.id,
    text: interpolate(template, params.values ?? {}),
    translated: translatedTemplate !== undefined,
    translatorNote: message.translatorNote,
  };
}

export function listMissingReportCopyIds(catalog: ReportCopyCatalog): ReportCopyId[] {
  return REPORT_COPY_MESSAGES.map((message) => message.id).filter((id) => catalog[id] === undefined);
}
