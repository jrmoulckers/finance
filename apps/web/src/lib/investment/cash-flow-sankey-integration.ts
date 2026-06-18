// SPDX-License-Identifier: BUSL-1.1

import { buildCashFlowSankey, exportCashFlowSankeyCsv } from './cash-flow-sankey';
import type { CashFlowSankeyLine, CashFlowSankeyReport, SankeyLineKind } from './cash-flow-sankey';

/** Period, grouping, and export adapter for cash-flow Sankey integration (#2481, #2482). */

export type CashFlowSankeyRangePreset = 'MONTH' | 'CUSTOM' | 'ALL_TIME';

export interface CashFlowSankeyDateRange {
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
}

export interface CashFlowSankeyTransaction {
  readonly id: string;
  readonly date: string;
  readonly label: string;
  readonly amountCents: number;
  readonly kind: SankeyLineKind;
}

export interface CashFlowSankeyOtherGroup {
  readonly id: string;
  readonly label: string;
  readonly kind: SankeyLineKind;
  readonly amountCents: number;
  readonly children: readonly CashFlowSankeyLine[];
}

export interface CashFlowSankeyRangeReport {
  readonly range: CashFlowSankeyDateRange;
  readonly report: CashFlowSankeyReport;
  readonly otherGroups: readonly CashFlowSankeyOtherGroup[];
  readonly csv: string;
}

function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function normalizeLineId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function dateRangeLabel(startDate: string, endDate: string): string {
  return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
}

export function resolveCashFlowSankeyDateRange(params: {
  readonly preset: CashFlowSankeyRangePreset;
  readonly month?: string;
  readonly customStartDate?: string;
  readonly customEndDate?: string;
  readonly transactions?: readonly Pick<CashFlowSankeyTransaction, 'date'>[];
}): CashFlowSankeyDateRange {
  if (params.preset === 'MONTH') {
    const month = params.month ?? new Date().toISOString().slice(0, 7);
    const startDate = `${month}-01`;
    const endDate = monthEnd(month);
    return { startDate, endDate, label: month };
  }
  if (params.preset === 'CUSTOM') {
    const startDate =
      params.customStartDate ?? params.customEndDate ?? new Date().toISOString().slice(0, 10);
    const endDate = params.customEndDate ?? startDate;
    return { startDate, endDate, label: dateRangeLabel(startDate, endDate) };
  }

  const sortedDates = [...(params.transactions ?? [])].map((txn) => txn.date).sort();
  const startDate = sortedDates[0] ?? new Date().toISOString().slice(0, 10);
  const endDate = sortedDates.at(-1) ?? startDate;
  return { startDate, endDate, label: 'All time' };
}

function aggregateLines(transactions: readonly CashFlowSankeyTransaction[]): CashFlowSankeyLine[] {
  const groups = new Map<string, CashFlowSankeyLine>();
  for (const transaction of transactions) {
    const id = normalizeLineId(`${transaction.kind}-${transaction.label}`) || transaction.id;
    const existing = groups.get(id);
    const amountCents = Math.abs(Math.round(transaction.amountCents));
    groups.set(id, {
      id,
      label: transaction.label,
      kind: transaction.kind,
      amountCents: (existing?.amountCents ?? 0) + amountCents,
    });
  }
  return [...groups.values()].sort(
    (a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label),
  );
}

function groupSmallLinesByKind(
  lines: readonly CashFlowSankeyLine[],
  thresholdPercent: number,
): {
  readonly lines: readonly CashFlowSankeyLine[];
  readonly otherGroups: readonly CashFlowSankeyOtherGroup[];
} {
  const totalByKind = new Map<SankeyLineKind, number>();
  for (const line of lines)
    totalByKind.set(line.kind, (totalByKind.get(line.kind) ?? 0) + line.amountCents);

  const visible: CashFlowSankeyLine[] = [];
  const otherGroups: CashFlowSankeyOtherGroup[] = [];
  const smallByKind = new Map<SankeyLineKind, CashFlowSankeyLine[]>();

  for (const line of lines) {
    const thresholdCents = (totalByKind.get(line.kind) ?? 0) * (thresholdPercent / 100);
    if (thresholdPercent > 0 && line.amountCents < thresholdCents) {
      smallByKind.set(line.kind, [...(smallByKind.get(line.kind) ?? []), line]);
    } else {
      visible.push(line);
    }
  }

  for (const [kind, children] of smallByKind) {
    const amountCents = children.reduce((sum, child) => sum + child.amountCents, 0);
    const id = `${kind.toLowerCase()}-other`;
    const label = kind === 'INCOME' ? 'Other income' : `Other ${kind.toLowerCase()}`;
    visible.push({ id, label, kind, amountCents });
    otherGroups.push({ id, label, kind, amountCents, children });
  }

  return {
    lines: visible.sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label)),
    otherGroups,
  };
}

export function buildCashFlowSankeyRangeReport(params: {
  readonly transactions: readonly CashFlowSankeyTransaction[];
  readonly range: CashFlowSankeyDateRange;
  readonly otherThresholdPercent?: number;
}): CashFlowSankeyRangeReport {
  const inRange = params.transactions.filter(
    (txn) => txn.date >= params.range.startDate && txn.date <= params.range.endDate,
  );
  const incomeLines = aggregateLines(inRange.filter((txn) => txn.kind === 'INCOME'));
  const outflowLines = aggregateLines(inRange.filter((txn) => txn.kind !== 'INCOME'));
  const incomeGrouped = groupSmallLinesByKind(incomeLines, params.otherThresholdPercent ?? 2);
  const outflowGrouped = groupSmallLinesByKind(outflowLines, params.otherThresholdPercent ?? 2);
  const report = buildCashFlowSankey({
    income: incomeGrouped.lines,
    outflows: outflowGrouped.lines,
    otherThresholdPercent: 0,
  });

  return {
    range: params.range,
    report,
    otherGroups: [...incomeGrouped.otherGroups, ...outflowGrouped.otherGroups],
    csv: exportCashFlowSankeyCsv(report.accessibleRows),
  };
}
