// SPDX-License-Identifier: BUSL-1.1

/**
 * Sankey money-flow data engine.
 *
 * Transforms income and expense transactions into a node-link
 * structure for Sankey diagram rendering. Supports multi-level
 * flows: income → account → category → subcategory, with
 * savings/investment paths.
 *
 * All monetary values are integer cents. All functions are pure.
 *
 * References: issues #1584, #1724
 */

import type { SankeyNode, SankeyLink, SankeyDiagram, SankeyPeriod } from './types';
import { bankersRound } from './budget-tags';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** A transaction record for Sankey processing. */
export interface SankeyTransaction {
  /** Transaction type. */
  readonly type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  /** Amount in cents (positive). */
  readonly amountCents: number;
  /** Source account identifier. */
  readonly accountId: string;
  /** Account display name. */
  readonly accountName: string;
  /** Category identifier (null for uncategorised). */
  readonly categoryId: string | null;
  /** Category display name. */
  readonly categoryName: string | null;
  /** Parent category id for subcategory grouping. */
  readonly parentCategoryId: string | null;
  /** Parent category name. */
  readonly parentCategoryName: string | null;
  /** Whether the category is an income category. */
  readonly isIncomeCategory: boolean;
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  /** Payee or source name. */
  readonly payee: string | null;
}

/** Configuration for Sankey diagram generation. */
export interface SankeyConfig {
  /** Include transfer flows between accounts. */
  readonly includeTransfers: boolean;
  /** Minimum flow amount in cents to include (filters noise). */
  readonly minimumFlowCents: number;
  /** Group small categories below this percentage into "Other". */
  readonly otherThresholdPercent: number;
  /** Whether to expand to subcategory level. */
  readonly showSubcategories: boolean;
}

/** Default Sankey configuration. */
export const DEFAULT_SANKEY_CONFIG: SankeyConfig = {
  includeTransfers: false,
  minimumFlowCents: 0,
  otherThresholdPercent: 2,
  showSubcategories: false,
};

// ---------------------------------------------------------------------------
// Period filtering
// ---------------------------------------------------------------------------

/**
 * Filter transactions to a specific period.
 *
 * @param transactions - All transactions.
 * @param period - Aggregation period type.
 * @param referenceDate - A date within the desired period (YYYY-MM-DD).
 * @returns Filtered transactions within the period.
 */
export function filterByPeriod(
  transactions: readonly SankeyTransaction[],
  period: SankeyPeriod,
  referenceDate: string,
): SankeyTransaction[] {
  const refDate = new Date(referenceDate + 'T00:00:00Z');
  const year = refDate.getUTCFullYear();
  const month = refDate.getUTCMonth();
  const quarter = Math.floor(month / 3);

  return transactions.filter((tx) => {
    const txDate = new Date(tx.date + 'T00:00:00Z');
    const txYear = txDate.getUTCFullYear();

    switch (period) {
      case 'monthly':
        return txYear === year && txDate.getUTCMonth() === month;
      case 'quarterly':
        return txYear === year && Math.floor(txDate.getUTCMonth() / 3) === quarter;
      case 'annual':
        return txYear === year;
      default:
        return true;
    }
  });
}

// ---------------------------------------------------------------------------
// Node/link builders
// ---------------------------------------------------------------------------

/**
 * Build Sankey nodes and links from transactions.
 *
 * Node levels:
 * - Level 0: Income sources (payee or "Income")
 * - Level 1: Accounts
 * - Level 2: Expense categories (or parent categories if subcategories enabled)
 * - Level 3: Subcategories (optional)
 *
 * Savings and investment accounts are routed to a special "Savings" node.
 *
 * @param transactions - Transactions to process.
 * @param config - Sankey configuration.
 * @returns SankeyDiagram data structure.
 */
export function buildSankeyDiagram(
  transactions: readonly SankeyTransaction[],
  config: Partial<SankeyConfig> = {},
): SankeyDiagram {
  const cfg: SankeyConfig = { ...DEFAULT_SANKEY_CONFIG, ...config };

  if (transactions.length === 0) {
    return { nodes: [], links: [], totalIncomeCents: 0, totalExpensesCents: 0, netFlowCents: 0 };
  }

  const nodeMap = new Map<string, SankeyNode>();
  const linkMap = new Map<string, number>(); // "source|target" -> cents

  let totalIncomeCents = 0;
  let totalExpensesCents = 0;

  // Helper: ensure node exists
  function ensureNode(id: string, label: string, level: number, type: SankeyNode['type']): void {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, label, level, type, valueCents: 0 });
    }
  }

  // Helper: add flow
  function addLink(source: string, target: string, cents: number): void {
    if (cents <= 0) return;
    const key = `${source}|${target}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + cents);
  }

  // Process income transactions
  for (const tx of transactions) {
    const amount = Math.abs(tx.amountCents);
    if (amount === 0) continue;

    if (tx.type === 'INCOME') {
      totalIncomeCents += amount;
      const sourceId = `income:${tx.payee ?? tx.categoryName ?? 'Income'}`;
      const sourceLabel = tx.payee ?? tx.categoryName ?? 'Income';
      const accountId = `account:${tx.accountId}`;

      ensureNode(sourceId, sourceLabel, 0, 'income');
      ensureNode(accountId, tx.accountName, 1, 'account');

      // Update node values
      const sourceNode = nodeMap.get(sourceId)!;
      nodeMap.set(sourceId, { ...sourceNode, valueCents: sourceNode.valueCents + amount });
      const acctNode = nodeMap.get(accountId)!;
      nodeMap.set(accountId, { ...acctNode, valueCents: acctNode.valueCents + amount });

      addLink(sourceId, accountId, amount);
    }

    if (tx.type === 'EXPENSE') {
      totalExpensesCents += amount;
      const accountId = `account:${tx.accountId}`;
      ensureNode(accountId, tx.accountName, 1, 'account');

      // Determine category node
      const catName = tx.categoryName ?? 'Uncategorised';
      const catId = tx.categoryId ?? 'uncategorised';

      if (cfg.showSubcategories && tx.parentCategoryId && tx.parentCategoryName) {
        // Two-level: account → parent category → subcategory
        const parentNodeId = `category:${tx.parentCategoryId}`;
        const subNodeId = `subcategory:${catId}`;
        ensureNode(parentNodeId, tx.parentCategoryName, 2, 'category');
        ensureNode(subNodeId, catName, 3, 'subcategory');

        addLink(accountId, parentNodeId, amount);
        addLink(parentNodeId, subNodeId, amount);

        const pn = nodeMap.get(parentNodeId)!;
        nodeMap.set(parentNodeId, { ...pn, valueCents: pn.valueCents + amount });
        const sn = nodeMap.get(subNodeId)!;
        nodeMap.set(subNodeId, { ...sn, valueCents: sn.valueCents + amount });
      } else {
        // Single-level: account → category
        const catNodeId = `category:${catId}`;
        ensureNode(catNodeId, catName, 2, 'category');
        addLink(accountId, catNodeId, amount);

        const cn = nodeMap.get(catNodeId)!;
        nodeMap.set(catNodeId, { ...cn, valueCents: cn.valueCents + amount });
      }
    }

    if (tx.type === 'TRANSFER' && cfg.includeTransfers) {
      const accountId = `account:${tx.accountId}`;
      ensureNode(accountId, tx.accountName, 1, 'account');

      const savingsId = 'savings:transfers';
      ensureNode(savingsId, 'Savings & Transfers', 2, 'savings');
      addLink(accountId, savingsId, amount);

      const sn = nodeMap.get(savingsId)!;
      nodeMap.set(savingsId, { ...sn, valueCents: sn.valueCents + amount });
    }
  }

  // Filter small flows
  const filteredLinkMap = new Map<string, number>();
  for (const [key, cents] of linkMap) {
    if (cents >= cfg.minimumFlowCents) {
      filteredLinkMap.set(key, cents);
    }
  }

  // Group small categories into "Other"
  if (cfg.otherThresholdPercent > 0 && totalExpensesCents > 0) {
    const threshold = bankersRound((cfg.otherThresholdPercent / 100) * totalExpensesCents);
    const smallCategories: string[] = [];

    for (const [id, node] of nodeMap) {
      if (
        (node.type === 'category' || node.type === 'subcategory') &&
        node.valueCents < threshold
      ) {
        smallCategories.push(id);
      }
    }

    if (smallCategories.length > 1) {
      const otherLevel = smallCategories.some((id) => nodeMap.get(id)?.type === 'subcategory')
        ? 3
        : 2;
      const otherId = `category:other`;
      let otherTotal = 0;

      for (const id of smallCategories) {
        otherTotal += nodeMap.get(id)?.valueCents ?? 0;
        nodeMap.delete(id);

        // Redirect links
        for (const [key, cents] of filteredLinkMap) {
          const [source, target] = key.split('|');
          if (target === id) {
            filteredLinkMap.delete(key);
            const newKey = `${source}|${otherId}`;
            filteredLinkMap.set(newKey, (filteredLinkMap.get(newKey) ?? 0) + cents);
          }
          if (source === id) {
            filteredLinkMap.delete(key);
            const newKey = `${otherId}|${target}`;
            filteredLinkMap.set(newKey, (filteredLinkMap.get(newKey) ?? 0) + cents);
          }
        }
      }

      ensureNode(otherId, 'Other', otherLevel, 'category');
      const on = nodeMap.get(otherId)!;
      nodeMap.set(otherId, { ...on, valueCents: on.valueCents + otherTotal });
    }
  }

  // Build final links with percentOfSource
  const sourceOutflows = new Map<string, number>();
  for (const [key, cents] of filteredLinkMap) {
    const source = key.split('|')[0];
    sourceOutflows.set(source, (sourceOutflows.get(source) ?? 0) + cents);
  }

  const links: SankeyLink[] = [];
  for (const [key, cents] of filteredLinkMap) {
    const [source, target] = key.split('|');
    const sourceTotal = sourceOutflows.get(source) ?? 0;
    links.push({
      source,
      target,
      valueCents: cents,
      percentOfSource: sourceTotal > 0 ? Math.round((cents / sourceTotal) * 10000) / 100 : 0,
    });
  }

  // Sort links by value descending
  links.sort((a, b) => b.valueCents - a.valueCents);

  const nodes = [...nodeMap.values()].sort(
    (a, b) => a.level - b.level || b.valueCents - a.valueCents,
  );

  return {
    nodes,
    links,
    totalIncomeCents,
    totalExpensesCents,
    netFlowCents: totalIncomeCents - totalExpensesCents,
  };
}

// ---------------------------------------------------------------------------
// Net flow calculation
// ---------------------------------------------------------------------------

/**
 * Compute net flow for each account from Sankey transactions.
 *
 * @param transactions - Sankey transactions.
 * @returns Map from accountId to net flow in cents (positive = net inflow).
 */
export function computeAccountNetFlows(
  transactions: readonly SankeyTransaction[],
): Map<string, { accountName: string; netFlowCents: number }> {
  const map = new Map<string, { accountName: string; netFlowCents: number }>();

  for (const tx of transactions) {
    const entry = map.get(tx.accountId) ?? { accountName: tx.accountName, netFlowCents: 0 };
    const amount = Math.abs(tx.amountCents);
    if (tx.type === 'INCOME') {
      entry.netFlowCents += amount;
    } else if (tx.type === 'EXPENSE') {
      entry.netFlowCents -= amount;
    }
    // Transfers are zero-sum for net flow
    map.set(tx.accountId, entry);
  }

  return map;
}
