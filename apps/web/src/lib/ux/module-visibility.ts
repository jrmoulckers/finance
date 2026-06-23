// SPDX-License-Identifier: BUSL-1.1

/**
 * Minimalist mode — module visibility preference model.
 *
 * Lets a low-noise (e.g. FIRE-focused) user hide product areas / nav modules
 * they never use — bills, reports, mood tags, etc. — so the app feels
 * purpose-built around the few areas they care about (savings rate, net worth,
 * investments).
 *
 * This module is intentionally pure and dependency-free:
 *   - A typed catalogue of hideable modules ({@link HIDEABLE_MODULES}).
 *   - A small set of localStorage-backed helpers that persist the set of
 *     hidden module ids, matching the existing preference patterns
 *     (`finance-*` keys, graceful try/catch around `localStorage`).
 *   - Pure, deterministic selectors that filter a nav config or a dashboard
 *     card list by the hidden set.
 *
 * Core / essential areas ({@link ESSENTIAL_MODULE_IDS}) can never be hidden so
 * the user can't lock themselves out of the app. Unknown ids and essentials are
 * always treated as visible, so empty / all-hidden / stale data are all handled
 * gracefully.
 *
 * It deliberately does NOT import the React nav config so it stays a leaf module
 * (no import cycles) and keeps the eagerly-loaded nav/dashboard chunks lean.
 *
 * References: issue #2122
 */

/** UI grouping for hideable modules, mirroring the primary nav groups. */
export type HideableModuleCategory = 'money' | 'plan' | 'insights' | 'connect';

/** Display labels for the hideable-module categories. */
export const HIDEABLE_MODULE_CATEGORY_LABELS: Readonly<Record<HideableModuleCategory, string>> = {
  money: 'Money',
  plan: 'Plan',
  insights: 'Insights',
  connect: 'Connect',
};

/** Render order for the hideable-module categories. */
export const HIDEABLE_MODULE_CATEGORY_ORDER: readonly HideableModuleCategory[] = Object.freeze([
  'money',
  'plan',
  'insights',
  'connect',
]);

/** A product area / nav module a user may choose to hide. */
export interface HideableModule {
  /** Stable id — matches the corresponding `NavConfigItem.id` in navConfig. */
  id: string;
  /** Visible label shown in the settings control. */
  label: string;
  /** One-line description of what hiding this module removes. */
  description: string;
  /** Grouping bucket for the settings UI. */
  category: HideableModuleCategory;
}

/** localStorage key for the persisted set of hidden module ids. */
export const MODULE_VISIBILITY_STORAGE_KEY = 'finance-hidden-modules';

/**
 * Same-tab change event. Persisting fires this so chrome rendered in the same
 * document (nav, dashboard cards) can react without a full reload. Cross-tab
 * updates arrive via the native `storage` event.
 */
export const MODULE_VISIBILITY_CHANGE_EVENT = 'finance:module-visibility-change';

/**
 * Core areas that are never hideable, so a user can never remove every way back
 * to their data or to this very setting. Anything not present in
 * {@link HIDEABLE_MODULES} is implicitly always visible too — this list just
 * makes the most important guarantees explicit and defends against stale data.
 */
export const ESSENTIAL_MODULE_IDS: readonly string[] = Object.freeze([
  'dashboard',
  'accounts',
  'transactions',
  'settings',
]);

const ESSENTIAL_MODULE_ID_SET: ReadonlySet<string> = new Set(ESSENTIAL_MODULE_IDS);

/**
 * Canonical list of hideable module ids — the lightweight source of truth for
 * membership checks ({@link isHideableModule}). Kept as a plain string array,
 * separate from the richer {@link HIDEABLE_MODULES} catalogue, so the hot
 * predicate/selector path (nav chrome, dashboard cards) tree-shakes free of the
 * catalogue's labels and descriptions and stays out of the eager bundle.
 *
 * Order mirrors {@link HIDEABLE_MODULES}; a unit test enforces they stay in sync.
 */
export const HIDEABLE_MODULE_IDS: readonly string[] = Object.freeze([
  // Money
  'bills',
  'subscriptions',
  'invoices',
  'remittances',
  'expected-income',
  'investments',
  'tax-center',
  'safety',
  // Plan
  'budgets',
  'trip-budgets',
  'debt',
  'goals',
  'planning',
  'fire',
  'learning',
  'estate',
  'categories',
  // Insights
  'insights',
  'cash-flow',
  'cash-runway',
  'net-worth',
  'reports',
  'client-profitability',
  'business-pnl',
  'achievements',
  'watchlists',
  // Connect
  'household',
  'bank-connections',
  'import',
  'privacy',
]);

const HIDEABLE_MODULE_ID_SET: ReadonlySet<string> = new Set(HIDEABLE_MODULE_IDS);

/**
 * The catalogue of modules a minimalist user may hide. Ids match nav item ids
 * so the same filter applies to the nav chrome and to dashboard quick-access
 * cards. Order within a category controls render order in the settings UI.
 *
 * Only the settings UI consumes the labels/descriptions, so this catalogue is
 * deliberately kept out of {@link isHideableModule}'s dependency graph, and is
 * a plain (un-frozen) array literal so bundlers can tree-shake it away from the
 * nav/dashboard chunks that never read it.
 */
export const HIDEABLE_MODULES: readonly HideableModule[] = [
  // ── Money ────────────────────────────────────────────────────────────
  {
    id: 'bills',
    label: 'Bills',
    description: 'Upcoming and recurring bill reminders.',
    category: 'money',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    description: 'Recurring memberships and renewals.',
    category: 'money',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    description: 'Freelance invoice pipeline and expected income.',
    category: 'money',
  },
  {
    id: 'remittances',
    label: 'Remittances',
    description: 'Money sent abroad: fees, FX rate and what recipients receive.',
    category: 'money',
  },
  {
    id: 'expected-income',
    label: 'Expected Income',
    description: 'Track expected vs. cleared income.',
    category: 'money',
  },
  {
    id: 'investments',
    label: 'Investments',
    description: 'Holdings, performance and watchlists.',
    category: 'money',
  },
  {
    id: 'tax-center',
    label: 'Tax Center',
    description: 'Lot-level gains, estimated taxes and wash-sale guardrails.',
    category: 'money',
  },
  {
    id: 'safety',
    label: 'Safety',
    description: 'Plain-English scam checks and safety tips.',
    category: 'money',
  },
  // ── Plan ─────────────────────────────────────────────────────────────
  {
    id: 'budgets',
    label: 'Budgets',
    description: 'Track spending against monthly limits.',
    category: 'plan',
  },
  {
    id: 'trip-budgets',
    label: 'Trip Budgets',
    description: 'Country/trip envelopes with local-currency spend.',
    category: 'plan',
  },
  {
    id: 'debt',
    label: 'Debt',
    description: 'Payoff planner, BNPL, student loans and credit cards.',
    category: 'plan',
  },
  {
    id: 'goals',
    label: 'Goals',
    description: 'Savings targets and progress.',
    category: 'plan',
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'Long-range projections and what-ifs.',
    category: 'plan',
  },
  {
    id: 'fire',
    label: 'FIRE Planner',
    description: 'FI number, years-to-FI and Coast FI.',
    category: 'plan',
  },
  {
    id: 'learning',
    label: 'Learning',
    description: 'Financial literacy modules and quizzes.',
    category: 'plan',
  },
  {
    id: 'estate',
    label: 'Estate Inventory',
    description: 'Estate and end-of-life inventory for beneficiaries.',
    category: 'plan',
  },
  {
    id: 'categories',
    label: 'Categories',
    description: 'Customise how transactions are classified.',
    category: 'plan',
  },
  // ── Insights ─────────────────────────────────────────────────────────
  {
    id: 'insights',
    label: 'Insights',
    description: 'Trends, anomalies and personalised tips.',
    category: 'insights',
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow',
    description: 'Money in vs. money out over time.',
    category: 'insights',
  },
  {
    id: 'cash-runway',
    label: 'Cash Runway',
    description: 'Forecast whether cash covers bills before revenue lands.',
    category: 'insights',
  },
  {
    id: 'net-worth',
    label: 'Net Worth',
    description: 'Assets minus liabilities, tracked monthly.',
    category: 'insights',
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Build and export custom reports.',
    category: 'insights',
  },
  {
    id: 'client-profitability',
    label: 'Client Profitability',
    description: 'Revenue, cost and margin by client/project tag.',
    category: 'insights',
  },
  {
    id: 'business-pnl',
    label: 'Profit & Loss',
    description: 'Weekly/monthly P&L with COGS, labor and margins.',
    category: 'insights',
  },
  {
    id: 'achievements',
    label: 'Achievements',
    description: 'Milestones and streaks you have earned.',
    category: 'insights',
  },
  {
    id: 'watchlists',
    label: 'Watchlists',
    description: 'Symbols and markets you follow.',
    category: 'insights',
  },
  // ── Connect ──────────────────────────────────────────────────────────
  {
    id: 'household',
    label: 'Household',
    description: 'Shared budgets, goals and members.',
    category: 'connect',
  },
  {
    id: 'bank-connections',
    label: 'Bank Connections',
    description: 'Linked institutions and sync status.',
    category: 'connect',
  },
  {
    id: 'import',
    label: 'Import Data',
    description: 'Bring in CSVs, OFX files and receipts.',
    category: 'connect',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    description: 'Consent, data export and deletion.',
    category: 'connect',
  },
];

// ---------------------------------------------------------------------------
// Pure predicates & selectors
// ---------------------------------------------------------------------------

/**
 * Whether a module id may be hidden. Essential and unknown ids are never
 * hideable, which keeps the user from locking themselves out.
 */
export function isHideableModule(id: string): boolean {
  return HIDEABLE_MODULE_ID_SET.has(id) && !ESSENTIAL_MODULE_ID_SET.has(id);
}

/**
 * Whether a module is currently hidden given a hidden-id set. Only hideable
 * modules can ever be hidden; essentials and unknown ids always return `false`.
 */
export function isModuleHidden(id: string, hiddenModuleIds: ReadonlySet<string>): boolean {
  return isHideableModule(id) && hiddenModuleIds.has(id);
}

/** Convenience inverse of {@link isModuleHidden}. */
export function isModuleVisible(id: string, hiddenModuleIds: ReadonlySet<string>): boolean {
  return !isModuleHidden(id, hiddenModuleIds);
}

/**
 * Filter any id-bearing list (e.g. a nav config) by the hidden set, preserving
 * order. Essentials and unknown ids always pass through.
 */
export function filterByModuleVisibility<T extends { id: string }>(
  items: readonly T[],
  hiddenModuleIds: ReadonlySet<string>,
): T[] {
  if (hiddenModuleIds.size === 0) {
    return [...items];
  }
  return items.filter((item) => isModuleVisible(item.id, hiddenModuleIds));
}

/**
 * Filter a dashboard quick-access card list keyed by `moduleId` by the hidden
 * set, preserving order. Cards whose module is hidden are removed; cards for
 * essential / unknown modules always pass through.
 */
export function filterDashboardCards<T extends { moduleId: string }>(
  cards: readonly T[],
  hiddenModuleIds: ReadonlySet<string>,
): T[] {
  if (hiddenModuleIds.size === 0) {
    return [...cards];
  }
  return cards.filter((card) => isModuleVisible(card.moduleId, hiddenModuleIds));
}

/**
 * Drop any ids that are not currently hideable (essential, unknown or stale)
 * from a candidate hidden set. Deterministic and immutable.
 */
export function sanitizeHiddenModuleIds(ids: Iterable<string>): Set<string> {
  const result = new Set<string>();
  for (const id of ids) {
    if (isHideableModule(id)) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Return a new hidden set with `id` hidden or shown. Hiding a non-hideable id is
 * a no-op; the input set is never mutated.
 */
export function setModuleHidden(
  current: ReadonlySet<string>,
  id: string,
  hidden: boolean,
): Set<string> {
  const next = new Set(current);
  if (hidden) {
    if (isHideableModule(id)) {
      next.add(id);
    }
  } else {
    next.delete(id);
  }
  return next;
}

/** Count how many *hideable* modules are currently hidden. */
export function countHiddenModules(hiddenModuleIds: ReadonlySet<string>): number {
  let count = 0;
  for (const id of hiddenModuleIds) {
    if (isHideableModule(id)) {
      count += 1;
    }
  }
  return count;
}

/** All hideable modules belonging to a category, in catalogue order. */
export function getHideableModulesByCategory(
  category: HideableModuleCategory,
): readonly HideableModule[] {
  return HIDEABLE_MODULES.filter((module) => module.category === category);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Load the persisted hidden-module set from localStorage. Returns an empty set
 * for missing / malformed data and silently drops unknown or essential ids.
 */
export function getStoredHiddenModuleIds(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(MODULE_VISIBILITY_STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return sanitizeHiddenModuleIds(
      parsed.filter((value): value is string => typeof value === 'string'),
    );
  } catch {
    return new Set();
  }
}

/**
 * Persist the hidden-module set to localStorage as a sorted, sanitized array so
 * the round-trip is deterministic. Silently tolerates unavailable storage.
 */
export function saveHiddenModuleIds(hiddenModuleIds: ReadonlySet<string>): void {
  try {
    const sanitized = [...sanitizeHiddenModuleIds(hiddenModuleIds)].sort();
    globalThis.localStorage?.setItem(MODULE_VISIBILITY_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // Storage unavailable or full — ignore; the in-memory preference still applies.
  }
}

/**
 * Persist the hidden-module set and notify same-tab listeners via
 * {@link MODULE_VISIBILITY_CHANGE_EVENT}. Returns the sanitized set actually
 * stored so callers can keep their in-memory state in sync.
 */
export function persistHiddenModuleIds(hiddenModuleIds: ReadonlySet<string>): Set<string> {
  const sanitized = sanitizeHiddenModuleIds(hiddenModuleIds);
  saveHiddenModuleIds(sanitized);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(MODULE_VISIBILITY_CHANGE_EVENT, { detail: [...sanitized] }),
    );
  }
  return sanitized;
}
