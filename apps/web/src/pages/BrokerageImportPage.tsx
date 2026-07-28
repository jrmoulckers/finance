// SPDX-License-Identifier: BUSL-1.1

/**
 * Brokerage trade-import + cross-broker reconciliation page.
 *
 * Thin wiring layer. The {@link BrokerageImportPanel} is self-contained (it owns
 * its own local parse/reconcile state — this slice previews and reconciles only,
 * with no persistence) and is imported directly (not via the shared
 * `components/import` barrel) so its weight stays inside this route's own lazy
 * chunk and does not inflate other import routes.
 *
 * References: issue #2120
 */

import React from 'react';
import { Link } from 'react-router';

// Direct import keeps this heavy component code-split into the brokerage route chunk.
import { BrokerageImportPanel } from '../components/import/BrokerageImportPanel';

export const BrokerageImportPage: React.FC = () => {
  return (
    <div className="brokerage-import-page">
      <p className="brokerage-import-page__back">
        <Link to="/import">← Back to all imports</Link>
      </p>
      <BrokerageImportPanel />
    </div>
  );
};

export default BrokerageImportPage;
