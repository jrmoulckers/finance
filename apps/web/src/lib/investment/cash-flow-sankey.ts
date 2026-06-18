// SPDX-License-Identifier: BUSL-1.1

/** Income and expense Sankey report data builder for visual cash-flow reports (#2247). */

export type SankeyLineKind = 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'DEBT' | 'SAVINGS';

export interface CashFlowSankeyLine {
  readonly id: string;
  readonly label: string;
  readonly amountCents: number;
  readonly kind: SankeyLineKind;
}

export interface CashFlowSankeyInput {
  readonly income: readonly CashFlowSankeyLine[];
  readonly outflows: readonly CashFlowSankeyLine[];
  readonly otherThresholdPercent?: number;
}

export interface CashFlowSankeyNode {
  readonly id: string;
  readonly label: string;
  readonly kind: SankeyLineKind | 'CENTER' | 'SURPLUS' | 'DEFICIT';
  readonly amountCents: number;
}

export interface CashFlowSankeyLink {
  readonly source: string;
  readonly target: string;
  readonly amountCents: number;
}

export interface CashFlowSankeyReport {
  readonly nodes: readonly CashFlowSankeyNode[];
  readonly links: readonly CashFlowSankeyLink[];
  readonly totalIncomeCents: number;
  readonly totalOutflowCents: number;
  readonly netCashFlowCents: number;
  readonly accessibleRows: readonly CashFlowSankeyLink[];
  readonly csv: string;
}

const CENTER_NODE: CashFlowSankeyNode = {
  id: 'available-cash',
  label: 'Available cash',
  kind: 'CENTER',
  amountCents: 0,
};

function groupSmallLines(
  lines: readonly CashFlowSankeyLine[],
  totalCents: number,
  thresholdPercent: number,
  kind: SankeyLineKind,
): readonly CashFlowSankeyLine[] {
  const thresholdCents = totalCents * (thresholdPercent / 100);
  const large = lines.filter((line) => line.amountCents >= thresholdCents);
  const small = lines.filter((line) => line.amountCents < thresholdCents);
  const otherTotal = small.reduce((sum, line) => sum + line.amountCents, 0);
  return otherTotal > 0
    ? [
        ...large,
        { id: `${kind.toLowerCase()}-other`, label: 'Other', amountCents: otherTotal, kind },
      ]
    : large;
}

function nodeFromLine(prefix: string, line: CashFlowSankeyLine): CashFlowSankeyNode {
  return {
    id: `${prefix}:${line.id}`,
    label: line.label,
    kind: line.kind,
    amountCents: line.amountCents,
  };
}

export function exportCashFlowSankeyCsv(links: readonly CashFlowSankeyLink[]): string {
  const rows = ['source,target,amountCents'];
  for (const link of links) rows.push(`${link.source},${link.target},${link.amountCents}`);
  return rows.join('\n');
}

export function buildCashFlowSankey(input: CashFlowSankeyInput): CashFlowSankeyReport {
  const totalIncomeCents = input.income.reduce((sum, line) => sum + line.amountCents, 0);
  const totalOutflowCents = input.outflows.reduce((sum, line) => sum + line.amountCents, 0);
  const thresholdPercent = input.otherThresholdPercent ?? 2;
  const income = groupSmallLines(input.income, totalIncomeCents, thresholdPercent, 'INCOME');
  const outflows = groupSmallLines(input.outflows, totalOutflowCents, thresholdPercent, 'EXPENSE');
  const incomeNodes = income.map((line) => nodeFromLine('income', line));
  const outflowNodes = outflows.map((line) => nodeFromLine('outflow', line));
  const links: CashFlowSankeyLink[] = [
    ...incomeNodes.map((node) => ({
      source: node.id,
      target: CENTER_NODE.id,
      amountCents: node.amountCents,
    })),
    ...outflowNodes.map((node) => ({
      source: CENTER_NODE.id,
      target: node.id,
      amountCents: node.amountCents,
    })),
  ];
  const netCashFlowCents = totalIncomeCents - totalOutflowCents;
  const balancingNodes: CashFlowSankeyNode[] = [];

  if (netCashFlowCents > 0) {
    const surplusNode: CashFlowSankeyNode = {
      id: 'surplus',
      label: 'Unallocated surplus',
      kind: 'SURPLUS',
      amountCents: netCashFlowCents,
    };
    balancingNodes.push(surplusNode);
    links.push({ source: CENTER_NODE.id, target: surplusNode.id, amountCents: netCashFlowCents });
  } else if (netCashFlowCents < 0) {
    const deficitNode: CashFlowSankeyNode = {
      id: 'deficit',
      label: 'Deficit funded elsewhere',
      kind: 'DEFICIT',
      amountCents: Math.abs(netCashFlowCents),
    };
    balancingNodes.push(deficitNode);
    links.push({
      source: deficitNode.id,
      target: CENTER_NODE.id,
      amountCents: Math.abs(netCashFlowCents),
    });
  }

  const nodes = [
    ...incomeNodes,
    { ...CENTER_NODE, amountCents: Math.max(totalIncomeCents, totalOutflowCents) },
    ...outflowNodes,
    ...balancingNodes,
  ];

  return {
    nodes,
    links,
    totalIncomeCents,
    totalOutflowCents,
    netCashFlowCents,
    accessibleRows: links,
    csv: exportCashFlowSankeyCsv(links),
  };
}
