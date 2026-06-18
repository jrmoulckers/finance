// SPDX-License-Identifier: BUSL-1.1

/**
 * Local Tax Center export helpers for printable and CSV review outputs.
 *
 * The report remains a user-recorded-data summary and does not create official
 * IRS, CRA, HMRC, ATO, or EU tax forms. References: issue #2634.
 */

import type {
  TaxSummarySectionKey,
  TaxSummarySourceLink,
  TaxYearSummaryReport,
} from '../reports/tax-year-summary';

export interface TaxSummaryCsvRow {
  readonly sectionKey: TaxSummarySectionKey;
  readonly sectionLabel: string;
  readonly amountCents: number;
  readonly sourceCount: number;
  readonly sourceIds: string;
}

export interface TaxSummaryDrillDownLink extends TaxSummarySourceLink {
  readonly href: string;
}

export interface TaxSummaryPrintableExport {
  readonly taxYear: number;
  readonly csv: string;
  readonly printableHtml: string;
  readonly sourceLinks: readonly TaxSummaryDrillDownLink[];
  readonly disclaimer: string;
}

const TAX_SUMMARY_EXPORT_DISCLAIMER =
  'Tax Center exports distinguish recorded data from estimated tax calculations and are for educational review only, not tax advice or an official filing.';

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hrefFor(source: TaxSummarySourceLink): string {
  return `#${encodeURIComponent(`${source.type}:${source.id}`)}`;
}

export function buildTaxSummaryCsvRows(report: TaxYearSummaryReport): TaxSummaryCsvRow[] {
  return report.sections.map((section) => ({
    sectionKey: section.key,
    sectionLabel: section.label,
    amountCents: section.amountCents,
    sourceCount: section.sourceLinks.length,
    sourceIds: section.sourceLinks.map((source) => `${source.type}:${source.id}`).join('|'),
  }));
}

export function taxSummaryRowsToCsv(rows: readonly TaxSummaryCsvRow[]): string {
  const headers = [
    'sectionKey',
    'sectionLabel',
    'amountCents',
    'sourceCount',
    'sourceIds',
  ] as const;
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
}

export function buildTaxSummarySourceLinks(
  report: TaxYearSummaryReport,
): TaxSummaryDrillDownLink[] {
  const links = new Map<string, TaxSummaryDrillDownLink>();
  for (const section of report.sections) {
    for (const source of section.sourceLinks) {
      const key = `${source.type}:${source.id}`;
      links.set(key, { ...source, href: hrefFor(source) });
    }
  }
  for (const flag of report.qualityFlags) {
    for (const source of flag.sourceLinks) {
      const key = `${source.type}:${source.id}`;
      links.set(key, { ...source, href: hrefFor(source) });
    }
  }
  return [...links.values()].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}

export function buildTaxSummaryPrintableHtml(report: TaxYearSummaryReport): string {
  const sectionRows = report.sections
    .map(
      (section) =>
        `<tr><th>${htmlEscape(section.label)}</th><td>${section.amountCents}</td><td>${section.sourceLinks.length}</td></tr>`,
    )
    .join('');
  const flags = report.qualityFlags
    .map((flag) => `<li>${htmlEscape(flag.label)} (${htmlEscape(flag.severity)})</li>`)
    .join('');
  const notes = [...report.notes, TAX_SUMMARY_EXPORT_DISCLAIMER]
    .map((note) => `<li>${htmlEscape(note)}</li>`)
    .join('');

  return [
    '<article class="tax-summary-print">',
    `<h1>Tax Center summary ${report.taxYear}</h1>`,
    `<p>Reporting period: ${report.periodStart} to ${report.periodEnd}</p>`,
    '<table><thead><tr><th>Section</th><th>Amount (cents)</th><th>Sources</th></tr></thead>',
    `<tbody>${sectionRows}</tbody></table>`,
    `<h2>Data-quality checks</h2><ul>${flags}</ul>`,
    `<h2>Notes</h2><ul>${notes}</ul>`,
    '</article>',
  ].join('');
}

export function buildTaxSummaryPrintableExport(
  report: TaxYearSummaryReport,
): TaxSummaryPrintableExport {
  const rows = buildTaxSummaryCsvRows(report);
  return {
    taxYear: report.taxYear,
    csv: taxSummaryRowsToCsv(rows),
    printableHtml: buildTaxSummaryPrintableHtml(report),
    sourceLinks: buildTaxSummarySourceLinks(report),
    disclaimer: TAX_SUMMARY_EXPORT_DISCLAIMER,
  };
}
