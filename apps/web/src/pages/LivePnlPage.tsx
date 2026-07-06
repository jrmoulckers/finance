// SPDX-License-Identifier: BUSL-1.1

/**
 * LivePnlPage — live cross-broker P&L and net-worth dashboard for active
 * traders. Designed to sit on a second monitor during market hours: it answers
 * "what changed right now?" across every brokerage, account, asset class, and
 * symbol, with explicit freshness/staleness indicators for volatile assets.
 *
 * Data flows through {@link useLivePnl} (hooks-only); this page only handles
 * loading / empty / populated states and renders {@link LivePnlDashboard}.
 *
 * References: issue #2124
 */

import React from 'react';
import { EmptyState, LoadingSpinner } from '../components/common';
import { LivePnlDashboard } from '../components/dashboard/LivePnlDashboard';
import { useLivePnl } from '../hooks/useLivePnl';

export const LivePnlPage: React.FC = () => {
  const { view, loading, error, isLive, isSimulated, refresh } = useLivePnl();

  if (loading) {
    return (
      <div className="live-pnl" style={{ paddingTop: 'var(--spacing-8)', textAlign: 'center' }}>
        <LoadingSpinner label="Loading live P&L data" />
      </div>
    );
  }

  if (!view) {
    return (
      <EmptyState
        title="No positions to track"
        description="Add investment holdings or brokerage accounts to see live cross-broker P&L and net worth during the trading day."
      />
    );
  }

  return (
    <LivePnlDashboard
      view={view}
      isLive={isLive}
      isSimulated={isSimulated}
      realizedTracked={false}
      error={error}
      onRefresh={refresh}
    />
  );
};

export default LivePnlPage;
