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

import React, { useCallback, useState } from 'react';

import { ConnectionHealthCard } from '../components/bank/ConnectionHealthCard';
import { ProviderStatusList } from '../components/bank/ProviderStatusList';
import { SafetyCenter } from '../components/bank/SafetyCenter';
import '../components/bank/bank-connections.css';
import { useBankConnections } from '../hooks/useBankConnections';
import { useConnectorPermissions } from '../hooks/useConnectorPermissions';

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
    refresh: refreshConnections,
    loadHealthHistory,
  } = useBankConnections();

  const {
    permissions,
    accessLog,
    loading: permissionsLoading,
    error: permissionsError,
    loadAccessLog,
  } = useConnectorPermissions();

  const [activeTab, setActiveTab] = useState<'health' | 'providers' | 'safety'>('health');

  const handleViewHistory = useCallback(
    (connectionId: string) => {
      loadHealthHistory(connectionId);
    },
    [loadHealthHistory],
  );

  const handleReauth = useCallback((_connectionId: string) => {
    // TODO: Trigger re-authentication flow via aggregator provider
    // This would open the provider's link/widget for re-auth
  }, []);

  // Connection summary counts
  const healthyCount = connections.filter((c) => c.healthStatus === 'healthy').length;
  const issueCount = connections.filter((c) => c.healthStatus !== 'healthy').length;
  const needsReauthCount = connections.filter((c) => c.needsReauth).length;

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title">Bank Connections</h1>
        <p className="page-subtitle">
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

      {/* Tab navigation */}
      <nav className="tab-nav" aria-label="Bank connections sections">
        <button
          type="button"
          className={`tab-nav__tab ${activeTab === 'health' ? 'tab-nav__tab--active' : ''}`}
          onClick={() => setActiveTab('health')}
          aria-selected={activeTab === 'health'}
          role="tab"
        >
          Connection Health
        </button>
        <button
          type="button"
          className={`tab-nav__tab ${activeTab === 'providers' ? 'tab-nav__tab--active' : ''}`}
          onClick={() => setActiveTab('providers')}
          aria-selected={activeTab === 'providers'}
          role="tab"
        >
          Providers
        </button>
        <button
          type="button"
          className={`tab-nav__tab ${activeTab === 'safety' ? 'tab-nav__tab--active' : ''}`}
          onClick={() => setActiveTab('safety')}
          aria-selected={activeTab === 'safety'}
          role="tab"
        >
          Safety Center
        </button>
      </nav>

      {/* Tab content */}
      <div className="tab-content" role="tabpanel">
        {/* Health tab */}
        {activeTab === 'health' && (
          <section aria-label="Connection health">
            <div className="section-header">
              <h2 className="section-title">Connection Health</h2>
              <button
                type="button"
                className="section-action"
                onClick={refreshConnections}
                aria-label="Refresh connection health"
              >
                Refresh
              </button>
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
              <div className="empty-state">
                <h3 className="empty-state__title">No bank connections</h3>
                <p className="empty-state__description">
                  Connect your bank accounts to automatically import transactions and monitor
                  account balances.
                </p>
              </div>
            )}

            {connections.map((connection) => (
              <ConnectionHealthCard
                key={connection.id}
                connection={connection}
                onViewHistory={handleViewHistory}
                onReauth={handleReauth}
              />
            ))}
          </section>
        )}

        {/* Providers tab */}
        {activeTab === 'providers' && (
          <ProviderStatusList providers={providers} loading={connectionsLoading} />
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
    </div>
  );
};

export default BankConnectionsPage;
