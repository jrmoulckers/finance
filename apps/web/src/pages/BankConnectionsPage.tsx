// SPDX-License-Identifier: BUSL-1.1

/**
 * BankConnectionsPage — Bank Connection Health Center.
 *
 * Unified dashboard for bank connection health monitoring, aggregator
 * provider status, and third-party connector permissions.
 *
 * Layout:
 *   1. Connection Health Overview — cards for each connection
 *   2. Provider Status — aggregator health scores
 *   3. Safety Center — third-party access permissions
 *
 * @module pages/BankConnectionsPage
 * References: #1575, #1577, #1583
 */

import React, { Suspense, lazy, useCallback, useRef, useState } from 'react';

import { ConnectionHealthCard } from '../components/bank/ConnectionHealthCard';
import { ProviderStatusList } from '../components/bank/ProviderStatusList';
import { SafetyCenter } from '../components/bank/SafetyCenter';
import { EmptyState } from '../components/common/EmptyState';
import '../components/bank/bank-connections.css';
import { useBankConnections } from '../hooks/useBankConnections';
import { useConnectorPermissions } from '../hooks/useConnectorPermissions';
import { useFeatureFlag, FlagKeys } from '../lib/feature-flags';
import { useOptionalFeatureGate } from '../components/feature-gate';
import { formatDate } from '../utils/formatDate';

/**
 * "Connect a bank" launcher (#3846). Lazy-loaded and rendered only when the
 * `live_bank_data` flag is on, so the aggregator/Plaid Link code stays out of
 * the bundle until a user can actually connect a bank.
 */
const ConnectBankButton = lazy(() =>
  import('../components/bank/ConnectBankButton').then((module) => ({
    default: module.ConnectBankButton,
  })),
);

/**
 * Crypto wallet & exchange panel (#2164). Lazy-loaded so the crypto engine only
 * enters the bundle when a user opens the Wallets & Exchanges tab.
 */
const CryptoConnectionsPanel = lazy(() =>
  import('../components/investments/CryptoConnectionsPanel').then((module) => ({
    default: module.CryptoConnectionsPanel,
  })),
);

// ---------------------------------------------------------------------------
// Tabs (WAI-ARIA Tabs pattern — #3862)
// ---------------------------------------------------------------------------

/** Identifiers for the four dashboard tabs, in display order. */
type BankTabId = 'health' | 'providers' | 'crypto' | 'safety';

/** A single tab's identity and visible label. */
interface BankTabDef {
  readonly id: BankTabId;
  readonly label: string;
}

/**
 * Ordered tab definitions that drive the tablist. Keeping them in one array
 * lets the render, roving `tabIndex`, and keyboard handler stay in lockstep.
 */
const BANK_TABS: readonly BankTabDef[] = [
  { id: 'health', label: 'Connection Health' },
  { id: 'providers', label: 'Providers' },
  { id: 'crypto', label: 'Wallets & Exchanges' },
  { id: 'safety', label: 'Safety Center' },
];

/** Stable id of the shared tab panel; every tab's `aria-controls` points here. */
const TAB_PANEL_ID = 'bank-connections-tabpanel';

/** Builds the DOM id for a tab button so the panel can reference the active tab. */
const tabButtonId = (id: BankTabId): string => `bank-tab-${id}`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bank Connection Health Center page.
 *
 * Shows all bank connections with health status, staleness indicators,
 * and provider status. Includes the safety center for third-party
 * permission management.
 */
export const BankConnectionsPage: React.FC = () => {
  const {
    connections,
    providers,
    loading: connectionsLoading,
    error: connectionsError,
    healthHistory,
    historyLoading,
    refresh: refreshConnections,
    reloadLocal: reloadConnections,
    loadHealthHistory,
  } = useBankConnections();

  const {
    permissions,
    accessLog,
    loading: permissionsLoading,
    error: permissionsError,
    loadAccessLog,
  } = useConnectorPermissions();

  const liveBankData = useFeatureFlag(FlagKeys.LIVE_BANK_DATA);
  const entitlementContext = useOptionalFeatureGate();
  const canRequestConnection =
    entitlementContext?.canRequestBankConnection(connections.length) ?? false;

  const [activeTab, setActiveTab] = useState<BankTabId>('health');
  const [historyConnectionId, setHistoryConnectionId] = useState<string | null>(null);

  // Roving-tabindex focus management for the tablist (#3862). Each tab button
  // registers its node so keyboard navigation can move DOM focus to the newly
  // selected tab (this UI uses automatic activation).
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activateTab = useCallback((index: number) => {
    const tab = BANK_TABS[index];
    if (!tab) return;
    setActiveTab(tab.id);
    tabRefs.current[index]?.focus();
  }, []);

  const handleTabListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const currentIndex = BANK_TABS.findIndex((tab) => tab.id === activeTab);
      if (currentIndex === -1) return;

      let nextIndex: number;
      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % BANK_TABS.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + BANK_TABS.length) % BANK_TABS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = BANK_TABS.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      activateTab(nextIndex);
    },
    [activeTab, activateTab],
  );

  const handleViewHistory = useCallback(
    (connectionId: string) => {
      setHistoryConnectionId(connectionId);
      void loadHealthHistory(connectionId);
    },
    [loadHealthHistory],
  );
  const historyConnection = connections.find((connection) => connection.id === historyConnectionId);

  const handleReauth = useCallback((_connectionId: string) => {
    // TODO: Trigger re-authentication flow via aggregator provider
    // This would open the provider's link/widget for re-auth
  }, []);

  // Connection summary counts
  const healthyCount = connections.filter((c) => c.healthStatus === 'healthy').length;
  const issueCount = connections.filter((c) => c.healthStatus !== 'healthy').length;
  const needsReauthCount = connections.filter((c) => c.needsReauth).length;

  return (
    <>
      <header>
        <div className="page-header">
          <h1 className="page-heading">Bank Connections</h1>
        </div>
        <p className="page-summary">
          Monitor connection health, manage third-party access, and configure providers.
        </p>
      </header>

      {/* Summary strip */}
      <div
        className="connection-summary"
        role="status"
        aria-live="polite"
        aria-label="Connection health summary"
      >
        <div className="connection-summary__stat">
          <span className="connection-summary__count">{connections.length}</span>
          <span className="connection-summary__label">Connections</span>
        </div>
        <div className="connection-summary__stat">
          <span className="connection-summary__count connection-summary__count--healthy">
            {healthyCount}
          </span>
          <span className="connection-summary__label">Healthy</span>
        </div>
        {issueCount > 0 && (
          <div className="connection-summary__stat">
            <span className="connection-summary__count connection-summary__count--issue">
              {issueCount}
            </span>
            <span className="connection-summary__label">Issues</span>
          </div>
        )}
        {needsReauthCount > 0 && (
          <div className="connection-summary__stat">
            <span className="connection-summary__count connection-summary__count--reauth">
              {needsReauthCount}
            </span>
            <span className="connection-summary__label">Need Re-auth</span>
          </div>
        )}
      </div>

      {/* Tab navigation — WAI-ARIA Tabs pattern (#3862). Roving tabindex keeps a
          single tab stop; Left/Right/Home/End move (and activate) tabs. */}
      <div
        className="tab-nav"
        role="tablist"
        aria-label="Bank connections sections"
        onKeyDown={handleTabListKeyDown}
      >
        {BANK_TABS.map((tab, index) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={tabButtonId(tab.id)}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              className={`tab-nav__tab ${isActive ? 'tab-nav__tab--active' : ''}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={TAB_PANEL_ID}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div
        className="tab-content"
        role="tabpanel"
        id={TAB_PANEL_ID}
        aria-labelledby={tabButtonId(activeTab)}
        tabIndex={0}
      >
        {/* Health tab */}
        {activeTab === 'health' && (
          <section aria-label="Connection health">
            <div className="section-header">
              <h2 className="section-title">Connection Health</h2>
              <div className="section-actions">
                {liveBankData && (
                  <>
                    {canRequestConnection ? (
                      <Suspense fallback={null}>
                        <ConnectBankButton onConnected={() => void reloadConnections()} />
                      </Suspense>
                    ) : (
                      <span role="status">
                        Refresh plan status before connecting a bank. Finance verifies access again
                        when the connection starts.
                      </span>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="section-action"
                  onClick={() => void refreshConnections()}
                  aria-label="Refresh connection health"
                >
                  Refresh
                </button>
              </div>
            </div>

            {connectionsLoading && (
              <div role="status" aria-live="polite">
                <p>Loading connections…</p>
              </div>
            )}

            {connectionsError && (
              <div role="alert">
                <p className="error-message">{connectionsError}</p>
              </div>
            )}

            {!connectionsLoading && !connectionsError && connections.length === 0 && (
              <EmptyState
                title="No bank connections"
                description="Connect your bank accounts to automatically import transactions and monitor account balances."
                headingLevel={3}
              />
            )}

            {connections.map((connection) => (
              <ConnectionHealthCard
                key={connection.id}
                connection={connection}
                onViewHistory={handleViewHistory}
                onReauth={handleReauth}
              />
            ))}

            {historyConnectionId && (
              <section className="connection-history" aria-labelledby="connection-history-title">
                <div className="connection-history__header">
                  <h3 id="connection-history-title">
                    Health history
                    {historyConnection ? ` for ${historyConnection.institutionName}` : ''}
                  </h3>
                  <button
                    type="button"
                    className="connection-health-card__action"
                    onClick={() => setHistoryConnectionId(null)}
                  >
                    Close history
                  </button>
                </div>

                {historyLoading ? (
                  <p role="status">Loading health history…</p>
                ) : healthHistory.length === 0 ? (
                  <p className="connection-history__empty">
                    No health events have been recorded for this connection.
                  </p>
                ) : (
                  <ol className="connection-history__list">
                    {healthHistory.map((event) => (
                      <li key={event.id} className="connection-history__event">
                        <div className="connection-history__event-header">
                          <strong>{event.status.replaceAll('_', ' ')}</strong>
                          <time dateTime={event.createdAt}>
                            {formatDate(event.createdAt, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </time>
                        </div>
                        {event.errorCategory && <p>Error category: {event.errorCategory}</p>}
                        {event.errorDetail && <p>Error detail: {event.errorDetail}</p>}
                        {event.resolvedAt && (
                          <p>
                            Resolved{' '}
                            <time dateTime={event.resolvedAt}>
                              {formatDate(event.resolvedAt, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </time>
                            {event.resolutionAction
                              ? ` via ${event.resolutionAction.replaceAll('_', ' ')}`
                              : ''}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </section>
        )}

        {/* Providers tab */}
        {activeTab === 'providers' && (
          <ProviderStatusList providers={providers} loading={connectionsLoading} />
        )}

        {/* Wallets & Exchanges tab (#2164) */}
        {activeTab === 'crypto' && (
          <section aria-label="Crypto wallets and exchanges">
            <Suspense
              fallback={
                <div role="status" aria-live="polite">
                  <p>Loading wallets &amp; exchanges…</p>
                </div>
              }
            >
              <CryptoConnectionsPanel />
            </Suspense>
          </section>
        )}

        {/* Safety Center tab */}
        {activeTab === 'safety' && (
          <SafetyCenter
            permissions={permissions}
            accessLog={accessLog}
            loading={permissionsLoading}
            error={permissionsError}
            onLoadAccessLog={loadAccessLog}
          />
        )}
      </div>
    </>
  );
};

export default BankConnectionsPage;
