// SPDX-License-Identifier: BUSL-1.1

/**
 * Single source of truth for primary navigation destinations.
 *
 * Both the desktop sidebar and the mobile bottom-nav / "More" sheet render
 * from this config so every route is reachable on every viewport (#1930).
 *
 * Conventions:
 *   - `mobilePriority` ranks items for the bottom-nav tab bar
 *     (lower = higher priority). The bottom-nav reserves 4 slots for the
 *     top-priority items and 1 slot for the "More" button.
 *   - `group` clusters items in the sidebar and the "More" sheet. Items
 *     without a group are pinned at the top of the sidebar.
 *   - `description` is shown beneath the label in the "More" sheet to help
 *     new users disambiguate destinations.
 */

import type React from 'react';

import { ensureStableNavOrder } from '../../lib/navigation/guardrails';
import { filterByModuleVisibility } from '../../lib/ux/module-visibility';
import { Icon } from '../common/Icon';
import { IconToken } from '../../icons/tokens';
import { AppIcon } from '../icons';
import { DebtIcon, InvoicesIcon, PrivacyIcon, ReportsIcon } from './navIcons';

/** Named navigation groups, displayed in this order in the sidebar. */
export type NavGroup = 'money' | 'plan' | 'insights' | 'connect';

/** Display label for each group header. */
export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  money: 'Money',
  plan: 'Plan',
  insights: 'Insights',
  connect: 'Connect',
};

/** Sidebar render order for groups. */
export const NAV_GROUP_ORDER: readonly NavGroup[] = Object.freeze([
  'money',
  'plan',
  'insights',
  'connect',
]);

/** A single destination in the primary navigation. */
export interface NavConfigItem {
  /** Stable identifier. */
  id: string;
  /** Visible label. */
  label: string;
  /** Target route path. */
  href: string;
  /** Icon element (24×24 stroke SVG). */
  icon: React.ReactNode;
  /** Group bucket; omit for pinned/top-level destinations. */
  group?: NavGroup;
  /**
   * Sort position for mobile bottom-nav eligibility (lower = higher priority).
   * Items outside the top priority slots appear in the "More" sheet.
   */
  mobilePriority: number;
  /** One-line helper text shown in the "More" sheet. */
  description?: string;
}

/**
 * Every destination reachable from the primary navigation.
 * Order within each group controls render order in the sidebar.
 */
export const NAV_CONFIG: readonly NavConfigItem[] = ensureStableNavOrder([
  // ── pinned (no group) ────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: <Icon name={IconToken.DASHBOARD} />,
    mobilePriority: 0,
    description: 'Overview of balances, spending and insights.',
  },

  // ── Money ────────────────────────────────────────────────────────────
  {
    id: 'accounts',
    label: 'Accounts',
    href: '/accounts',
    icon: <Icon name={IconToken.ACCOUNTS} />,
    group: 'money',
    mobilePriority: 1,
    description: 'Bank, credit, cash and investment accounts.',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    href: '/transactions',
    icon: <Icon name={IconToken.TRANSACTIONS} />,
    group: 'money',
    mobilePriority: 2,
    description: 'Every debit and credit, across all accounts.',
  },
  {
    id: 'safety',
    label: 'Safety',
    href: '/safety',
    icon: <PrivacyIcon />,
    group: 'money',
    mobilePriority: 5,
    description: 'Plain-English scam checks and safety tips.',
  },
  {
    id: 'bills',
    label: 'Bills',
    href: '/bills',
    icon: <Icon name={IconToken.BILL} />,
    group: 'money',
    mobilePriority: 6,
    description: 'Upcoming and recurring bill reminders.',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    href: '/invoices',
    icon: <InvoicesIcon />,
    group: 'money',
    mobilePriority: 9,
    description: 'Freelance invoice pipeline and expected income.',
  },
  {
    id: 'remittances',
    label: 'Remittances',
    href: '/remittances',
    icon: <Icon name={IconToken.TRANSFER} />,
    group: 'money',
    mobilePriority: 12,
    description: 'Track money sent abroad: fees, FX rate and what recipients receive.',
  },
  {
    id: 'expected-income',
    label: 'Expected Income',
    href: '/expected-income',
    icon: <Icon name={IconToken.INCOME} />,
    group: 'money',
    mobilePriority: 14,
    description: 'Track expected vs. cleared income so late money is not counted as spendable.',
  },
  {
    id: 'investments',
    label: 'Investments',
    href: '/investments',
    icon: <Icon name={IconToken.INVESTMENT} />,
    group: 'money',
    mobilePriority: 7,
    description: 'Holdings, performance and watchlists.',
  },
  {
    id: 'live-pnl',
    label: 'Live P&L',
    href: '/live-pnl',
    icon: <Icon name={IconToken.INVESTMENT} />,
    group: 'money',
    mobilePriority: 16,
    description: 'Real-time cross-broker P&L and net worth for active trading.',
  },
  {
    id: 'tax-center',
    label: 'Tax Center',
    href: '/investments/tax',
    icon: <ReportsIcon />,
    group: 'money',
    mobilePriority: 8,
    description: 'Lot-level investment gains and wash-sale guardrails.',
  },
  {
    id: 'estimated-tax',
    label: 'Estimated Taxes',
    href: '/estimated-tax',
    icon: <ReportsIcon />,
    group: 'money',
    mobilePriority: 35,
    description: 'Quarterly self-employment tax set-aside and next due date.',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    href: '/subscriptions',
    icon: <Icon name={IconToken.CATEGORY_SUBSCRIPTIONS} />,
    group: 'money',
    mobilePriority: 10,
    description: 'Recurring memberships and renewals.',
  },

  // ── Plan ─────────────────────────────────────────────────────────────
  {
    id: 'budgets',
    label: 'Budgets',
    href: '/budgets',
    icon: <Icon name={IconToken.BUDGETS} />,
    group: 'plan',
    mobilePriority: 4,
    description: 'Track spending against monthly limits.',
  },
  {
    id: 'trip-budgets',
    label: 'Trip Budgets',
    href: '/trip-budgets',
    icon: <AppIcon name="globe" size={24} />,
    group: 'plan',
    mobilePriority: 20,
    description: 'Country/trip envelopes with local-currency spend and home-currency roll-up.',
  },
  {
    id: 'debt',
    label: 'Debt',
    href: '/debt',
    icon: <DebtIcon />,
    group: 'plan',
    mobilePriority: 3,
    description: 'Payoff planner, BNPL, student loans and credit cards.',
  },
  {
    id: 'building-credit',
    label: 'Building Credit',
    href: '/building-credit',
    icon: <Icon name={IconToken.SECURE} />,
    group: 'plan',
    mobilePriority: 21,
    description: 'Beginner credit lessons and a secured-card utilization tracker.',
  },
  {
    id: 'goals',
    label: 'Goals',
    href: '/goals',
    icon: <Icon name={IconToken.GOALS} />,
    group: 'plan',
    mobilePriority: 11,
    description: 'Savings targets and progress.',
  },
  {
    id: 'planning',
    label: 'Planning',
    href: '/planning',
    icon: <Icon name={IconToken.CHART_LINE} />,
    group: 'plan',
    mobilePriority: 13,
    description: 'Long-range projections and what-ifs.',
  },
  {
    id: 'fire',
    label: 'FIRE Planner',
    href: '/fire',
    icon: <AppIcon name="flame" size={24} />,
    group: 'plan',
    mobilePriority: 19,
    description: 'Financial independence: FI number, years-to-FI and Coast FI.',
  },
  {
    id: 'learning',
    label: 'Learning',
    href: '/learning',
    icon: <Icon name={IconToken.CATEGORY_EDUCATION} />,
    group: 'plan',
    mobilePriority: 15,
    description: 'Personalized financial literacy modules and quizzes.',
  },
  {
    id: 'estate',
    label: 'Estate Inventory',
    href: '/estate',
    icon: <Icon name={IconToken.SECURE} />,
    group: 'plan',
    mobilePriority: 17,
    description: 'Estate and end-of-life inventory for beneficiaries.',
  },
  {
    id: 'categories',
    label: 'Categories',
    href: '/categories',
    icon: <Icon name={IconToken.FILTER} />,
    group: 'plan',
    mobilePriority: 18,
    description: 'Customise how transactions are classified.',
  },

  // ── Insights ─────────────────────────────────────────────────────────
  {
    id: 'insights',
    label: 'Insights',
    href: '/insights',
    icon: <Icon name={IconToken.INSIGHTS} />,
    group: 'insights',
    mobilePriority: 22,
    description: 'Trends, anomalies and personalised tips.',
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow',
    href: '/cash-flow',
    icon: <Icon name={IconToken.TRANSFER} />,
    group: 'insights',
    mobilePriority: 23,
    description: 'Money in vs. money out over time.',
  },
  {
    id: 'cash-runway',
    label: 'Cash Runway',
    href: '/cash-runway',
    icon: <Icon name={IconToken.CHART_LINE} />,
    group: 'insights',
    mobilePriority: 29,
    description: 'Forecast whether cash covers payroll, taxes and bills before revenue lands.',
  },
  {
    id: 'net-worth',
    label: 'Net Worth',
    href: '/net-worth',
    icon: <Icon name={IconToken.NET_WORTH} />,
    group: 'insights',
    mobilePriority: 24,
    description: 'Assets minus liabilities, tracked monthly.',
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/report-builder',
    icon: <Icon name={IconToken.REPORTS} />,
    group: 'insights',
    mobilePriority: 25,
    description: 'Build and export custom reports.',
  },
  {
    id: 'client-profitability',
    label: 'Client Profitability',
    href: '/client-profitability',
    icon: <ReportsIcon />,
    group: 'insights',
    mobilePriority: 26,
    description: 'Revenue, cost and margin by client/project tag.',
  },
  {
    id: 'business-pnl',
    label: 'Profit & Loss',
    href: '/business-pnl',
    icon: <ReportsIcon />,
    group: 'insights',
    mobilePriority: 30,
    description: 'Weekly/monthly P&L with COGS, labor and margins.',
  },
  {
    id: 'achievements',
    label: 'Achievements',
    href: '/achievements',
    icon: <Icon name={IconToken.SUCCESS} />,
    group: 'insights',
    mobilePriority: 27,
    description: 'Milestones and streaks you have earned.',
  },
  {
    id: 'watchlists',
    label: 'Watchlists',
    href: '/watchlists',
    icon: <Icon name={IconToken.SEARCH} />,
    group: 'insights',
    mobilePriority: 28,
    description: 'Symbols and markets you follow.',
  },

  // ── Connect ──────────────────────────────────────────────────────────
  {
    id: 'household',
    label: 'Household',
    href: '/household',
    icon: <Icon name={IconToken.ACCOUNTS} />,
    group: 'connect',
    mobilePriority: 31,
    description: 'Shared budgets, goals and members.',
  },
  {
    id: 'bank-connections',
    label: 'Bank Connections',
    href: '/bank-connections',
    icon: <Icon name={IconToken.BANK} />,
    group: 'connect',
    mobilePriority: 32,
    description: 'Linked institutions and sync status.',
  },
  {
    id: 'import',
    label: 'Import Data',
    href: '/import',
    icon: <Icon name={IconToken.IMPORT} />,
    group: 'connect',
    mobilePriority: 33,
    description: 'Bring in CSVs, OFX files and receipts.',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    href: '/privacy-dashboard',
    icon: <Icon name={IconToken.SECURE} />,
    group: 'connect',
    mobilePriority: 34,
    description: 'Consent, data export and deletion.',
  },
]);

/** How many priority items show on the mobile bottom-nav (the 5th slot is "More"). */
export const BOTTOM_NAV_PRIORITY_COUNT = 4;

/** Primary destinations that remain visible in simplified accessibility mode. */
export const SIMPLIFIED_NAV_ITEM_IDS = [
  'dashboard',
  'accounts',
  'transactions',
  'budgets',
  'bills',
] as const;

const SIMPLIFIED_NAV_ITEM_ID_SET = new Set<string>(SIMPLIFIED_NAV_ITEM_IDS);

const NO_HIDDEN_MODULES: ReadonlySet<string> = new Set<string>();

/**
 * Primary destinations visible for the current chrome state.
 *
 * @param simplified       - When true, restrict to the simplified a11y subset.
 * @param hiddenModuleIds  - Modules the user has hidden via minimalist mode
 *   (#2122). Essential destinations are never removed.
 */
export function getVisibleNavItems(
  simplified: boolean,
  hiddenModuleIds: ReadonlySet<string> = NO_HIDDEN_MODULES,
): readonly NavConfigItem[] {
  const base = simplified
    ? NAV_CONFIG.filter((item) => SIMPLIFIED_NAV_ITEM_ID_SET.has(item.id))
    : NAV_CONFIG;
  return hiddenModuleIds.size === 0 ? base : filterByModuleVisibility(base, hiddenModuleIds);
}

export function getBottomNavPriorityItems(
  simplified = false,
  hiddenModuleIds: ReadonlySet<string> = NO_HIDDEN_MODULES,
): readonly NavConfigItem[] {
  return [...getVisibleNavItems(simplified, hiddenModuleIds)]
    .sort((a, b) => a.mobilePriority - b.mobilePriority)
    .slice(0, BOTTOM_NAV_PRIORITY_COUNT);
}

/**
 * Bottom-nav priority items, sorted by `mobilePriority`. The bottom-nav
 * appends a "More" button so all remaining items are still reachable.
 */
export const BOTTOM_NAV_PRIORITY_ITEMS: readonly NavConfigItem[] = getBottomNavPriorityItems();

/**
 * Adaptive bottom-nav ranking (#3687).
 *
 * Ranks visible destinations by how often the user has visited them, so the
 * tab bar surfaces the routes that person actually uses instead of a fixed
 * editorial order. Rules:
 *   - Dashboard is always pinned in the first slot (the app's home base).
 *   - Remaining slots are filled by descending visit count, breaking ties by
 *     the static `mobilePriority` so the ordering is deterministic.
 *   - New users (no recorded visits) fall back to the static
 *     `getBottomNavPriorityItems` order so the first-run experience is stable
 *     and predictable.
 *
 * This is a pure function: callers snapshot its result at mount so the tab bar
 * never reshuffles under the user mid-session.
 */
export function computeAdaptiveBottomNavItems(
  visitCounts: Readonly<Record<string, number>> = {},
  simplified = false,
  hiddenModuleIds: ReadonlySet<string> = NO_HIDDEN_MODULES,
): readonly NavConfigItem[] {
  const visible = getVisibleNavItems(simplified, hiddenModuleIds);
  const hasAnyVisits = visible.some((item) => (visitCounts[item.href] ?? 0) > 0);
  if (!hasAnyVisits) {
    return getBottomNavPriorityItems(simplified, hiddenModuleIds);
  }

  const dashboard = visible.find((item) => item.id === 'dashboard');
  const rest = visible.filter((item) => item.id !== 'dashboard');
  const ranked = [...rest].sort((a, b) => {
    const countA = visitCounts[a.href] ?? 0;
    const countB = visitCounts[b.href] ?? 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return a.mobilePriority - b.mobilePriority;
  });

  const slots: NavConfigItem[] = [];
  if (dashboard) {
    slots.push(dashboard);
  }
  for (const item of ranked) {
    if (slots.length >= BOTTOM_NAV_PRIORITY_COUNT) {
      break;
    }
    slots.push(item);
  }
  return slots;
}

export function getPinnedNavItems(
  simplified = false,
  hiddenModuleIds: ReadonlySet<string> = NO_HIDDEN_MODULES,
): readonly NavConfigItem[] {
  return getVisibleNavItems(simplified, hiddenModuleIds).filter((item) => item.group === undefined);
}

/** Destinations pinned above the grouped sections in the sidebar. */
export const PINNED_NAV_ITEMS: readonly NavConfigItem[] = getPinnedNavItems();

/** Destinations bucketed by group, preserving config order within each. */
export function getItemsByGroup(
  group: NavGroup,
  simplified = false,
  hiddenModuleIds: ReadonlySet<string> = NO_HIDDEN_MODULES,
): readonly NavConfigItem[] {
  return getVisibleNavItems(simplified, hiddenModuleIds).filter((item) => item.group === group);
}

export function getMoreSheetItems(
  simplified = false,
  hiddenModuleIds: ReadonlySet<string> = NO_HIDDEN_MODULES,
  priorityItems?: readonly NavConfigItem[],
): readonly NavConfigItem[] {
  const excluded = priorityItems ?? getBottomNavPriorityItems(simplified, hiddenModuleIds);
  return getVisibleNavItems(simplified, hiddenModuleIds).filter(
    (item) => !excluded.some((priorityItem) => priorityItem.id === item.id),
  );
}

/**
 * Page/browser titles for every primary destination, derived from
 * `NAV_CONFIG` so the header `<h1>`, the document title and the sidebar can
 * never disagree about a route's name (#3780, item 1).
 *
 * Keyed by `href`. Consumers (e.g. `App.tsx`) spread this first and then layer
 * bespoke, non-nav titles (Settings sub-pages, legal docs, detail routes) on
 * top so those overrides win.
 */
export const NAV_ROUTE_TITLES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(NAV_CONFIG.map((item) => [item.href, item.label])),
);

/**
 * Prefix-aware "is this destination active" test, shared by the sidebar,
 * bottom-nav and the mobile "More" sheet so every surface highlights the same
 * item for a given route (#3780, item 3).
 *
 * A destination is active when the path matches exactly, or when the path is a
 * sub-route of it (`/transactions/123` → Transactions) *unless* a more specific
 * destination in `NAV_CONFIG` owns that exact path (so `/investments/tax` marks
 * Tax Center, not Investments).
 */
export function isNavItemActive(activePath: string, href: string): boolean {
  if (activePath === href) return true;
  if (!activePath.startsWith(href + '/')) return false;
  return !NAV_CONFIG.some((item) => item.href === activePath);
}

/**
 * Items shown inside the mobile "More" sheet — everything that is not a
 * bottom-nav priority item, grouped for scanning.
 */
export const MORE_SHEET_ITEMS: readonly NavConfigItem[] = getMoreSheetItems();
