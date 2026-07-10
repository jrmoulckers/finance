// SPDX-License-Identifier: BUSL-1.1

/**
 * Route chunk prefetching (#3672).
 *
 * The router (`routes.tsx`) code-splits every page behind `React.lazy`, so the
 * first visit to a route pays a network round-trip to fetch its JS chunk. This
 * registry lets navigation chrome warm those chunks on hover / focus intent —
 * before the click — so the subsequent navigation renders instantly.
 *
 * Implementation notes:
 *   - Loaders use the SAME import specifiers as `routes.tsx`. Vite/Rollup key
 *     dynamic-import chunks by specifier, so prefetching reuses the exact chunk
 *     the router will later request — no bundle duplication.
 *   - Each href is fetched at most once (`prefetched` guard).
 *   - We respect the user's Data Saver preference and very slow connections so
 *     prefetching never works against people on constrained networks.
 */

type ChunkLoader = () => Promise<unknown>;

/**
 * Route href → chunk loader. Keyed by the `href` values in `navConfig.tsx`.
 * Keep in sync with the lazy imports in `routes.tsx`.
 */
const ROUTE_LOADERS: Readonly<Record<string, ChunkLoader>> = {
  '/dashboard': () => import('../../pages/DashboardPage'),
  '/notifications': () => import('../../pages/NotificationsPage'),
  '/safety': () => import('../../pages/SafetyPage'),
  '/accounts': () => import('../../pages/AccountsPage'),
  '/transactions': () => import('../../pages/TransactionsPage'),
  '/budgets': () => import('../../pages/BudgetsPage'),
  '/trip-budgets': () => import('../../pages/TripBudgetsPage'),
  '/categories': () => import('../../pages/CategoriesPage'),
  '/goals': () => import('../../pages/GoalsPage'),
  '/import': () => import('../../pages/ImportPage'),
  '/insights': () => import('../../pages/InsightsPage'),
  '/achievements': () => import('../../pages/AchievementsPage'),
  '/settings': () => import('../../pages/SettingsPage'),
  '/watchlists': () => import('../../pages/WatchlistsPage'),
  '/household': () => import('../../pages/HouseholdPage'),
  '/report-builder': () => import('../../pages/ReportBuilderPage'),
  '/client-profitability': () => import('../../pages/ClientProfitabilityPage'),
  '/business-pnl': () => import('../../pages/BusinessPnlPage'),
  '/estimated-tax': () => import('../../pages/EstimatedTaxPage'),
  '/investments': () => import('../../pages/InvestmentsPage'),
  '/live-pnl': () => import('../../pages/LivePnlPage'),
  '/investments/tax': () => import('../../pages/TaxCenterPage'),
  '/bills': () => import('../../pages/BillsPage'),
  '/planning': () => import('../../pages/PlanningPage'),
  '/learning': () => import('../../pages/LearningPage'),
  '/estate': () => import('../../pages/EstateInventoryPage'),
  '/privacy-dashboard': () => import('../../pages/PrivacyDashboardPage'),
  '/cash-flow': () => import('../../pages/CashFlowPage'),
  '/cash-runway': () => import('../../pages/CashRunwayPage'),
  '/invoices': () => import('../../pages/InvoicesPage'),
  '/net-worth': () => import('../../pages/NetWorthPage'),
  '/subscriptions': () => import('../../pages/SubscriptionsPage'),
  '/bank-connections': () => import('../../pages/BankConnectionsPage'),
  '/debt': () => import('../../pages/DebtPage'),
  '/building-credit': () => import('../../pages/BuildingCreditPage'),
  '/fire': () => import('../../pages/FirePlannerPage'),
  '/remittances': () => import('../../pages/RemittancesPage'),
  '/expected-income': () => import('../../pages/ExpectedIncomePage'),
};

/** hrefs already prefetched (or in flight) this session. */
const prefetched = new Set<string>();

interface NavigatorConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Skip prefetching when the user has Data Saver on or is on a 2G-class
 * connection — proactively downloading chunks would waste their data/battery.
 */
function shouldSkipPrefetch(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const connection = (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection;
  if (!connection) {
    return false;
  }
  if (connection.saveData) {
    return true;
  }
  const effectiveType = connection.effectiveType ?? '';
  return effectiveType === 'slow-2g' || effectiveType === '2g';
}

/** True when a loader is registered for `href`. Exposed for tests. */
export function canPrefetch(href: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTE_LOADERS, href);
}

/** True when `href` has already been prefetched this session. Exposed for tests. */
export function hasPrefetched(href: string): boolean {
  return prefetched.has(href);
}

/**
 * Warm the JS chunk for `href` once. Safe to call repeatedly (e.g. on every
 * `mouseenter`) — subsequent calls for the same href are no-ops. Returns `true`
 * when a fetch was actually kicked off, `false` when skipped/deduped.
 */
export function prefetchRoute(href: string): boolean {
  if (!href || prefetched.has(href)) {
    return false;
  }
  const loader = ROUTE_LOADERS[href];
  if (!loader) {
    return false;
  }
  if (shouldSkipPrefetch()) {
    return false;
  }
  prefetched.add(href);
  // Swallow errors: a failed prefetch must never surface to the user; the
  // router's own Suspense/error boundary handles the real navigation.
  void loader().catch(() => {
    // Allow a later real navigation (or retry) to attempt the load again.
    prefetched.delete(href);
  });
  return true;
}

/** Test-only: clear the dedupe set so specs start from a clean slate. */
export function resetPrefetchCacheForTests(): void {
  prefetched.clear();
}
