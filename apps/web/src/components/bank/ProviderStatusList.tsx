// SPDX-License-Identifier: BUSL-1.1

/**
 * ProviderStatusList — Displays aggregator provider health status.
 *
 * Shows all available aggregator providers with their health scores,
 * supported regions, and current status. Used in the admin/settings
 * area to monitor provider availability.
 *
 * @module components/bank/ProviderStatusList
 * References: #1575
 */

import React from 'react';

import type { AggregatorProvider } from '../../hooks/useBankConnections';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderStatusListProps {
  /** Available aggregator providers. */
  providers: AggregatorProvider[];
  /** Whether data is loading. */
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * List of aggregator providers with health status indicators.
 */
export const ProviderStatusList: React.FC<ProviderStatusListProps> = ({ providers, loading }) => {
  if (loading) {
    return (
      <div className="provider-status-list" role="status" aria-live="polite">
        <p>Loading provider status…</p>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="provider-status-list">
        <p>No aggregator providers configured.</p>
      </div>
    );
  }

  return (
    <section className="provider-status-list" aria-label="Aggregator provider health status">
      <h3 className="provider-status-list__title">Provider Status</h3>
      <ul className="provider-status-list__list" role="list">
        {providers.map((provider) => (
          <li
            key={provider.id}
            className="provider-status-list__item"
            role="listitem"
            aria-label={`${provider.displayName}: ${provider.status}`}
          >
            <div className="provider-status-list__header">
              <span className="provider-status-list__name">{provider.displayName}</span>
              <span
                className={`provider-status-list__badge provider-status-list__badge--${provider.status}`}
                role="status"
              >
                {provider.status}
              </span>
            </div>

            <div className="provider-status-list__details">
              <div className="provider-status-list__health">
                <span className="provider-status-list__label">Health</span>
                <div
                  className="provider-status-list__health-bar"
                  role="progressbar"
                  aria-valuenow={provider.healthScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Health score: ${provider.healthScore}%`}
                >
                  <div
                    className="provider-status-list__health-fill"
                    style={{ width: `${provider.healthScore}%` }}
                  />
                </div>
                <span className="provider-status-list__health-value">{provider.healthScore}%</span>
              </div>

              <div className="provider-status-list__meta">
                <span className="provider-status-list__type">{provider.providerType}</span>
                <span className="provider-status-list__priority">
                  Priority: {provider.priority}
                </span>
              </div>

              {provider.supportedRegions.length > 0 && (
                <div className="provider-status-list__regions">
                  <span className="provider-status-list__label">Regions:</span>
                  <span className="provider-status-list__region-list">
                    {provider.supportedRegions.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
