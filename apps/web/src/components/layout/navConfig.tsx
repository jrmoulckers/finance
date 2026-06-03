// SPDX-License-Identifier: BUSL-1.1

/**
 * Single source of truth for primary navigation destinations.
 *
 * Both the desktop sidebar and the mobile bottom-nav / "More" sheet render
 * from this config so every route is reachable on every viewport (#1930).
 *
 * Conventions:
 *   - `mobilePriority` < 99 surfaces the item on the bottom-nav tab bar
 *     (lower = higher priority). The bottom-nav reserves 4 slots for the
 *     top-priority items and 1 slot for the "More" button.
 *   - `group` clusters items in the sidebar and the "More" sheet. Items
 *     without a group are pinned at the top of the sidebar.
 *   - `description` is shown beneath the label in the "More" sheet to help
 *     new users disambiguate destinations.
 */

import type React from 'react';

import {
  DashboardIcon,
  AccountsIcon,
  TransactionsIcon,
  BillsIcon,
  InvestmentsIcon,
  SubscriptionsIcon,
  BudgetsIcon,
  GoalsIcon,
  PlanningIcon,
  CategoriesIcon,
  InsightsIcon,
  CashFlowIcon,
  NetWorthIcon,
  ReportsIcon,
  AchievementsIcon,
  WatchlistsIcon,
  HouseholdIcon,
  BankIcon,
  ImportIcon,
  PrivacyIcon,
} from './navIcons';

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
export const NAV_GROUP_ORDER: NavGroup[] = ['money', 'plan', 'insights', 'connect'];

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
   * Position on the mobile bottom-nav (lower = higher priority).
   * Items with priority >= 99 only appear in the "More" sheet.
   */
  mobilePriority: number;
  /** One-line helper text shown in the "More" sheet. */
  description?: string;
}

/**
 * Every destination reachable from the primary navigation.
 * Order within each group controls render order in the sidebar.
 */
export const NAV_CONFIG: readonly NavConfigItem[] = [
  // ── pinned (no group) ────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: <DashboardIcon />,
    mobilePriority: 0,
    description: 'Overview of balances, spending and insights.',
  },

  // ── Money ────────────────────────────────────────────────────────────
  {
    id: 'accounts',
    label: 'Accounts',
    href: '/accounts',
    icon: <AccountsIcon />,
    group: 'money',
    mobilePriority: 1,
    description: 'Bank, credit, cash and investment accounts.',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    href: '/transactions',
    icon: <TransactionsIcon />,
    group: 'money',
    mobilePriority: 2,
    description: 'Every debit and credit, across all accounts.',
  },
  {
    id: 'bills',
    label: 'Bills',
    href: '/bills',
    icon: <BillsIcon />,
    group: 'money',
    mobilePriority: 10,
    description: 'Upcoming and recurring bill reminders.',
  },
  {
    id: 'investments',
    label: 'Investments',
    href: '/investments',
    icon: <InvestmentsIcon />,
    group: 'money',
    mobilePriority: 11,
    description: 'Holdings, performance and watchlists.',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    href: '/subscriptions',
    icon: <SubscriptionsIcon />,
    group: 'money',
    mobilePriority: 12,
    description: 'Recurring memberships and renewals.',
  },

  // ── Plan ─────────────────────────────────────────────────────────────
  {
    id: 'budgets',
    label: 'Budgets',
    href: '/budgets',
    icon: <BudgetsIcon />,
    group: 'plan',
    mobilePriority: 3,
    description: 'Track spending against monthly limits.',
  },
  {
    id: 'goals',
    label: 'Goals',
    href: '/goals',
    icon: <GoalsIcon />,
    group: 'plan',
    mobilePriority: 13,
    description: 'Savings targets and progress.',
  },
  {
    id: 'planning',
    label: 'Planning',
    href: '/planning',
    icon: <PlanningIcon />,
    group: 'plan',
    mobilePriority: 14,
    description: 'Long-range projections and what-ifs.',
  },
  {
    id: 'categories',
    label: 'Categories',
    href: '/categories',
    icon: <CategoriesIcon />,
    group: 'plan',
    mobilePriority: 15,
    description: 'Customise how transactions are classified.',
  },

  // ── Insights ─────────────────────────────────────────────────────────
  {
    id: 'insights',
    label: 'Insights',
    href: '/insights',
    icon: <InsightsIcon />,
    group: 'insights',
    mobilePriority: 20,
    description: 'Trends, anomalies and personalised tips.',
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow',
    href: '/cash-flow',
    icon: <CashFlowIcon />,
    group: 'insights',
    mobilePriority: 21,
    description: 'Money in vs. money out over time.',
  },
  {
    id: 'net-worth',
    label: 'Net Worth',
    href: '/net-worth',
    icon: <NetWorthIcon />,
    group: 'insights',
    mobilePriority: 22,
    description: 'Assets minus liabilities, tracked monthly.',
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/report-builder',
    icon: <ReportsIcon />,
    group: 'insights',
    mobilePriority: 23,
    description: 'Build and export custom reports.',
  },
  {
    id: 'achievements',
    label: 'Achievements',
    href: '/achievements',
    icon: <AchievementsIcon />,
    group: 'insights',
    mobilePriority: 24,
    description: 'Milestones and streaks you have earned.',
  },
  {
    id: 'watchlists',
    label: 'Watchlists',
    href: '/watchlists',
    icon: <WatchlistsIcon />,
    group: 'insights',
    mobilePriority: 25,
    description: 'Symbols and markets you follow.',
  },

  // ── Connect ──────────────────────────────────────────────────────────
  {
    id: 'household',
    label: 'Household',
    href: '/household',
    icon: <HouseholdIcon />,
    group: 'connect',
    mobilePriority: 30,
    description: 'Shared budgets, goals and members.',
  },
  {
    id: 'bank-connections',
    label: 'Bank Connections',
    href: '/bank-connections',
    icon: <BankIcon />,
    group: 'connect',
    mobilePriority: 31,
    description: 'Linked institutions and sync status.',
  },
  {
    id: 'import',
    label: 'Import Data',
    href: '/import',
    icon: <ImportIcon />,
    group: 'connect',
    mobilePriority: 32,
    description: 'Bring in CSVs, OFX files and receipts.',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    href: '/privacy-dashboard',
    icon: <PrivacyIcon />,
    group: 'connect',
    mobilePriority: 33,
    description: 'Consent, data export and deletion.',
  },
];

/** How many priority items show on the mobile bottom-nav (the 5th slot is "More"). */
export const BOTTOM_NAV_PRIORITY_COUNT = 4;

/**
 * Bottom-nav priority items, sorted by `mobilePriority`. The bottom-nav
 * appends a "More" button so all remaining items are still reachable.
 */
export const BOTTOM_NAV_PRIORITY_ITEMS: readonly NavConfigItem[] = [...NAV_CONFIG]
  .sort((a, b) => a.mobilePriority - b.mobilePriority)
  .slice(0, BOTTOM_NAV_PRIORITY_COUNT);

/** Destinations pinned above the grouped sections in the sidebar. */
export const PINNED_NAV_ITEMS: readonly NavConfigItem[] = NAV_CONFIG.filter(
  (item) => item.group === undefined,
);

/** Destinations bucketed by group, preserving config order within each. */
export function getItemsByGroup(group: NavGroup): readonly NavConfigItem[] {
  return NAV_CONFIG.filter((item) => item.group === group);
}

/**
 * Items shown inside the mobile "More" sheet — everything that is not a
 * bottom-nav priority item, grouped for scanning.
 */
export const MORE_SHEET_ITEMS: readonly NavConfigItem[] = NAV_CONFIG.filter(
  (item) => !BOTTOM_NAV_PRIORITY_ITEMS.some((p) => p.id === item.id),
);
