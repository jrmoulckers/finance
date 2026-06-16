// SPDX-License-Identifier: BUSL-1.1

import type { Investment, InvestmentLot } from '../../kmp/bridge';
import { buildZipArchive, type ZipEntry } from '../data-access-package';
import { getCurrentLocale } from '../i18n';
import { escapeCsvField } from './simple-export';

export type ExportCell = string | number;

export interface InvestmentRealizedGainExportInput extends Record<string, unknown> {
  readonly symbol?: string;
  readonly soldDate?: string;
  readonly saleDate?: string;
  readonly date?: string;
  readonly proceeds?: unknown;
  readonly basis?: unknown;
  readonly costBasis?: unknown;
  readonly term?: string;
  readonly holdingPeriod?: string;
  readonly isLongTerm?: boolean;
  readonly gainLoss?: unknown;
  readonly gain?: unknown;
}

export interface InvestmentIncomeExportInput extends Record<string, unknown> {
  readonly symbol?: string;
  readonly date?: string;
  readonly paymentDate?: string;
  readonly amount?: unknown;
  readonly income?: unknown;
  readonly type?: string;
  readonly category?: string;
  readonly currency?: string;
  readonly description?: string;
  readonly source?: string;
}

export interface InvestmentExportInput {
  readonly investments: readonly Investment[];
  readonly lots?: readonly InvestmentLot[];
  readonly realizedGains?: readonly InvestmentRealizedGainExportInput[];
  readonly dividends?: readonly InvestmentIncomeExportInput[];
  readonly income?: readonly InvestmentIncomeExportInput[];
}

export interface InvestmentExportSheet {
  readonly name: string;
  readonly fileName: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly ExportCell[])[];
}

export function buildInvestmentExportSheets(input: InvestmentExportInput): InvestmentExportSheet[] {
  const lots = input.lots ?? [];
  const realizedGains = input.realizedGains ?? [];
  const incomeRows = [...(input.dividends ?? []), ...(input.income ?? [])];
  const investmentsById = new Map(
    input.investments.map((investment) => [investment.id, investment]),
  );

  return [
    {
      name: 'Holdings',
      fileName: 'investment_holdings.csv',
      headers: ['symbol', 'shares', 'cost_basis', 'current_value', 'unrealized_gain'],
      rows: input.investments.map((investment) => {
        const costBasis = Math.round(investment.shares * investment.costBasisPerShare.amount);
        const currentValue = Math.round(investment.shares * investment.currentPricePerShare.amount);
        return [
          investment.symbol,
          investment.shares,
          formatCents(costBasis),
          formatCents(currentValue),
          formatCents(currentValue - costBasis),
        ];
      }),
    },
    {
      name: 'Tax Lots',
      fileName: 'investment_tax_lots.csv',
      headers: ['symbol', 'acquired_date', 'shares', 'cost_basis'],
      rows: lots.map((lot) => {
        const investment = investmentsById.get(lot.investmentId);
        const totalCost =
          centsValue(lot.totalCost) ?? Math.round(lot.shares * lot.costPerShare.amount);
        return [investment?.symbol ?? '', lot.purchaseDate, lot.shares, formatCents(totalCost)];
      }),
    },
    {
      name: 'Realized Gains',
      fileName: 'investment_realized_gains.csv',
      headers: ['symbol', 'sold_date', 'proceeds', 'basis', 'term', 'gain_loss'],
      rows: realizedGains.map((gain) => {
        const proceeds = centsValue(gain.proceeds) ?? 0;
        const basis = centsValue(gain.basis ?? gain.costBasis) ?? 0;
        const gainLoss = centsValue(gain.gainLoss ?? gain.gain) ?? proceeds - basis;
        return [
          stringValue(gain.symbol),
          stringValue(gain.soldDate ?? gain.saleDate ?? gain.date),
          formatCents(proceeds),
          formatCents(basis),
          normalizeTerm(gain),
          formatCents(gainLoss),
        ];
      }),
    },
    {
      name: 'Dividends Income',
      fileName: 'investment_dividends_income.csv',
      headers: ['symbol', 'date', 'type', 'amount', 'currency', 'description'],
      rows: incomeRows.map((income) => [
        stringValue(income.symbol),
        stringValue(income.date ?? income.paymentDate),
        stringValue(income.type ?? income.category ?? income.source ?? 'Income'),
        formatCents(centsValue(income.amount ?? income.income) ?? 0),
        stringValue(income.currency),
        stringValue(income.description),
      ]),
    },
  ];
}

export function buildInvestmentCsvFiles(input: InvestmentExportInput): Array<{
  readonly name: string;
  readonly contents: string;
}> {
  return buildInvestmentExportSheets(input).map((sheet) => ({
    name: sheet.fileName,
    contents: buildSheetCsv(sheet),
  }));
}

export function buildInvestmentCsvZip(input: InvestmentExportInput): Uint8Array {
  const encoder = new TextEncoder();
  const csvFiles = buildInvestmentCsvFiles(input);
  const entries: ZipEntry[] = csvFiles.map((file) => ({
    path: file.name,
    bytes: encoder.encode(file.contents),
  }));
  return buildZipArchive(entries);
}

export function buildInvestmentXlsx(input: InvestmentExportInput): Uint8Array {
  const sheets = buildInvestmentExportSheets(input);
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', bytes: encoder.encode(buildContentTypesXml(sheets.length)) },
    { path: '_rels/.rels', bytes: encoder.encode(ROOT_RELS_XML) },
    { path: 'xl/workbook.xml', bytes: encoder.encode(buildWorkbookXml(sheets)) },
    {
      path: 'xl/_rels/workbook.xml.rels',
      bytes: encoder.encode(buildWorkbookRelsXml(sheets.length)),
    },
    { path: 'xl/styles.xml', bytes: encoder.encode(STYLES_XML) },
    ...sheets.map((sheet, index) => ({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      bytes: encoder.encode(buildWorksheetXml(sheet)),
    })),
  ];
  return buildZipArchive(entries);
}

function buildSheetCsv(sheet: InvestmentExportSheet): string {
  const rows = [sheet.headers, ...sheet.rows];
  return `${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`;
}

function centsValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'object' && value !== null && 'amount' in value) {
    const amount = (value as { amount?: unknown }).amount;
    if (typeof amount === 'number' && Number.isFinite(amount)) return Math.round(amount);
  }
  return null;
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat(getCurrentLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalizeTerm(gain: InvestmentRealizedGainExportInput): string {
  if (typeof gain.isLongTerm === 'boolean') return gain.isLongTerm ? 'LT' : 'ST';
  const raw = stringValue(gain.term ?? gain.holdingPeriod).toUpperCase();
  if (raw === 'LONG_TERM' || raw === 'LONG' || raw === 'LT') return 'LT';
  if (raw === 'SHORT_TERM' || raw === 'SHORT' || raw === 'ST') return 'ST';
  return raw;
}

function buildContentTypesXml(sheetCount: number): string {
  const sheetOverrides = Array.from(
    { length: sheetCount },
    (_unused, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`;
}

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;

function buildWorkbookXml(sheets: readonly InvestmentExportSheet[]): string {
  const sheetXml = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXmlAttribute(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetXml}</sheets></workbook>`;
}

function buildWorkbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_unused, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function buildWorksheetXml(sheet: InvestmentExportSheet): string {
  const rows = [sheet.headers, ...sheet.rows];
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((cell, columnIndex) =>
          buildCellXml(cell, `${columnName(columnIndex + 1)}${rowNumber}`),
        )
        .join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function buildCellXml(value: ExportCell, ref: string): string {
  const text = String(value);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${escapeXmlText(text)}</t></is></c>`;
}

function columnName(index: number): string {
  let name = '';
  let current = index;
  while (current > 0) {
    current -= 1;
    name = String.fromCharCode(65 + (current % 26)) + name;
    current = Math.floor(current / 26);
  }
  return name;
}

function escapeXmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
