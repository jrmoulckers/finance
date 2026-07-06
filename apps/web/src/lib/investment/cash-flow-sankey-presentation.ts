// SPDX-License-Identifier: BUSL-1.1

import type {
  CashFlowSankeyLink,
  CashFlowSankeyNode,
  CashFlowSankeyReport,
  SankeyLineKind,
} from './cash-flow-sankey';

/** UI-ready, accessible presentation model for cash-flow Sankey reports (#2480). */

export type CashFlowSankeyColorToken =
  'income' | 'expense' | 'transfer' | 'debt' | 'savings' | 'available-cash' | 'surplus' | 'deficit';

export interface CashFlowSankeyLegendItem {
  readonly token: CashFlowSankeyColorToken;
  readonly label: string;
  readonly description: string;
}

export interface CashFlowSankeyChartNode {
  readonly id: string;
  readonly label: string;
  readonly amountCents: number;
  readonly colorToken: CashFlowSankeyColorToken;
  readonly column: 'source' | 'center' | 'outflow' | 'balance';
}

export interface CashFlowSankeyTableRow {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly amountCents: number;
  readonly kind: SankeyLineKind | 'SURPLUS' | 'DEFICIT';
  readonly colorToken: CashFlowSankeyColorToken;
}

export interface CashFlowSankeyPresentation {
  readonly ariaLabel: string;
  readonly summary: string;
  readonly legend: readonly CashFlowSankeyLegendItem[];
  readonly nodes: readonly CashFlowSankeyChartNode[];
  readonly links: readonly CashFlowSankeyLink[];
  readonly tableRows: readonly CashFlowSankeyTableRow[];
}

const LEGEND: readonly CashFlowSankeyLegendItem[] = [
  { token: 'income', label: 'Income', description: 'Money flowing into available cash.' },
  { token: 'expense', label: 'Expenses', description: 'Recurring or discretionary spending.' },
  { token: 'transfer', label: 'Transfers', description: 'Cash moved between accounts.' },
  { token: 'debt', label: 'Debt', description: 'Debt payments and paydown activity.' },
  { token: 'savings', label: 'Savings', description: 'Saving and investing outflows.' },
  { token: 'surplus', label: 'Surplus', description: 'Cash left after visible outflows.' },
  { token: 'deficit', label: 'Deficit', description: 'Outflows greater than visible income.' },
];

function colorTokenForKind(kind: CashFlowSankeyNode['kind']): CashFlowSankeyColorToken {
  if (kind === 'INCOME') return 'income';
  if (kind === 'TRANSFER') return 'transfer';
  if (kind === 'DEBT') return 'debt';
  if (kind === 'SAVINGS') return 'savings';
  if (kind === 'CENTER') return 'available-cash';
  if (kind === 'SURPLUS') return 'surplus';
  if (kind === 'DEFICIT') return 'deficit';
  return 'expense';
}

function columnForNode(node: CashFlowSankeyNode): CashFlowSankeyChartNode['column'] {
  if (node.kind === 'INCOME' || node.kind === 'DEFICIT') return 'source';
  if (node.kind === 'CENTER') return 'center';
  if (node.kind === 'SURPLUS') return 'balance';
  return 'outflow';
}

function describeNetCashFlow(netCashFlowCents: number): string {
  if (netCashFlowCents > 0) return 'with surplus cash remaining';
  if (netCashFlowCents < 0) return 'with a cash-flow deficit';
  return 'with income matching outflows';
}

function tableKindForNode(node: CashFlowSankeyNode | undefined): CashFlowSankeyTableRow['kind'] {
  if (!node || node.kind === 'CENTER') return 'EXPENSE';
  return node.kind;
}

export function buildCashFlowSankeyPresentation(
  report: CashFlowSankeyReport,
): CashFlowSankeyPresentation {
  const nodesById = new Map(report.nodes.map((node) => [node.id, node]));
  const tableRows = report.accessibleRows.map((link): CashFlowSankeyTableRow => {
    const source = nodesById.get(link.source);
    const target = nodesById.get(link.target);
    const displayNode = target?.kind === 'CENTER' ? source : target;
    return {
      sourceId: link.source,
      sourceLabel: source?.label ?? link.source,
      targetId: link.target,
      targetLabel: target?.label ?? link.target,
      amountCents: link.amountCents,
      kind: tableKindForNode(displayNode),
      colorToken: colorTokenForKind(displayNode?.kind ?? 'EXPENSE'),
    };
  });

  return {
    ariaLabel: 'Cash-flow Sankey chart with equivalent table',
    summary: `Income sources total ${report.totalIncomeCents} cents and outflows total ${report.totalOutflowCents} cents, ${describeNetCashFlow(report.netCashFlowCents)}.`,
    legend: LEGEND,
    nodes: report.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      amountCents: node.amountCents,
      colorToken: colorTokenForKind(node.kind),
      column: columnForNode(node),
    })),
    links: report.links,
    tableRows,
  };
}
