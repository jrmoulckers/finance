// SPDX-License-Identifier: BUSL-1.1

/**
 * Venmo / Cash App (P2P) import page.
 *
 * Thin wiring layer: the {@link useP2PImport} hook owns all state and
 * persistence, {@link useAccounts} supplies the destination accounts, and the
 * presentational {@link P2PImportPanel} renders the accessible UI. The panel is
 * imported directly (not via the shared `components/import` barrel) so it stays
 * in this route's own lazy chunk and does not inflate other import routes.
 *
 * References: issue #2158
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router';

// Direct import keeps this heavy component code-split into the P2P route chunk.
import { P2PImportPanel } from '../components/import/P2PImportPanel';
import { useAccounts } from '../hooks/useAccounts';
import { useP2PImport } from '../hooks/useP2PImport';

export const P2PImportPage: React.FC = () => {
  const { accounts } = useAccounts();
  const p2p = useP2PImport();

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ id: account.id, name: account.name })),
    [accounts],
  );

  return (
    <div className="p2p-import-page">
      <p className="p2p-import-page__back">
        <Link to="/import">← Back to all imports</Link>
      </p>
      <P2PImportPanel
        fileName={p2p.fileName}
        plan={p2p.plan}
        overrides={p2p.overrides}
        parseError={p2p.parseError}
        accounts={accountOptions}
        selectedAccountId={p2p.selectedAccountId}
        importing={p2p.importing}
        saveResult={p2p.saveResult}
        onLoadFile={p2p.loadFile}
        onSetOverride={p2p.setOverride}
        onSelectAccount={p2p.setSelectedAccountId}
        onConfirmImport={p2p.confirmImport}
        onReset={p2p.reset}
      />
    </div>
  );
};

export default P2PImportPage;
