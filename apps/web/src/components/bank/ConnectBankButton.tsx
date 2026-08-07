// SPDX-License-Identifier: BUSL-1.1

/**
 * ConnectBankButton — launches the Plaid Link flow to connect a bank (#3846).
 *
 * Flow:
 *   1. Ask the edge backend for a `link_token` (`create_link_token`) through the
 *      registered Plaid aggregator provider.
 *   2. Open Plaid Link (loaded on demand from Plaid's CDN) with that token.
 *   3. On success, exchange the returned `public_token` (`exchange_token`). The
 *      backend then discovers + links the institution's accounts and runs an
 *      initial transaction backfill, so transactions appear right away.
 *   4. Refresh the connection list so the new connection surfaces.
 *
 * Rendered only when the `live_bank_data` flag is on (see `BankConnectionsPage`
 * / `main.tsx`). The aggregator provider layer and Plaid loader are pulled in via
 * dynamic `import()` so they stay code-split out of first paint.
 *
 * @module components/bank/ConnectBankButton
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  ensureDefaultHousehold,
  ensureSyncedHouseholdMembership,
} from '../../db/repositories/household';
import { HOUSEHOLD_SINGLETON_KEY, readHouseholdValue } from '../../db/repositories/householdData';

/** Props for {@link ConnectBankButton}. */
export interface ConnectBankButtonProps {
  /** Called after a bank connection is successfully established. */
  onConnected?: () => void;
}

type Phase = 'idle' | 'starting' | 'finishing' | 'error';

const PROVIDER_ID = 'plaid';

/**
 * Resolve the active household id from the SAME `hh_household` store the rest of
 * the app persists to (via the `useHousehold` hook / Household page).
 *
 * The first cut read the legacy relational `household` table, but the in-app
 * "create a household" flow writes to `hh_household`. That table stays empty for
 * real users, so the guard below wrongly fired even after a household existed
 * (only sample/seed data ever populated the legacy table).
 */
async function resolveHouseholdId(db: ReturnType<typeof useDatabase>): Promise<string | null> {
  const household = await readHouseholdValue<{ id?: unknown } | null>(
    db,
    HOUSEHOLD_SINGLETON_KEY,
    null,
  );
  return household && typeof household.id === 'string' && household.id.length > 0
    ? household.id
    : null;
}

/**
 * A button that runs the end-to-end "connect a bank" handshake via Plaid Link.
 */
export function ConnectBankButton({ onConnected }: ConnectBankButtonProps) {
  const db = useDatabase();
  const { user: authUser } = useAuth();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const userId = authUser?.id?.trim();
    let active = true;
    void (async () => {
      try {
        // Read the app's household from the same `hh_household` store the rest
        // of the app persists to (via the `useHousehold` hook / Household page).
        const household = await readHouseholdValue<{ id?: unknown; name?: unknown } | null>(
          db,
          HOUSEHOLD_SINGLETON_KEY,
          null,
        );
        let id =
          household && typeof household.id === 'string' && household.id.length > 0
            ? household.id
            : null;

        if (userId) {
          if (id) {
            // Existing household: backfill the synced `households` + owner
            // `household_members` rows so the bank-connection edge function can
            // authorize `create_link_token` (the `hh_*` doc store never reaches
            // the server). Running on mount gives PowerSync time to upload the
            // rows before the user connects. Best-effort.
            const name = typeof household?.name === 'string' ? household.name : 'Household';
            await ensureSyncedHouseholdMembership(db, { householdId: id, name, userId });
          } else {
            // Fresh account with no household yet: provision a default one so
            // the user never hits the "create a household first" wall before
            // their very first bank connection. `ensureDefaultHousehold` also
            // writes the synced membership rows.
            id = await ensureDefaultHousehold(db, {
              id: userId,
              name: authUser?.name ?? null,
              email: authUser?.email ?? null,
            });
          }
        }

        if (active) setHouseholdId(id);
      } catch {
        // Non-fatal: create_link_token will surface any genuine membership
        // issue, and the click handler re-attempts provisioning.
        if (active) setHouseholdId(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [db, authUser?.id, authUser?.name, authUser?.email]);

  const handleClick = useCallback(async () => {
    if (busyRef.current) return;
    // Re-resolve on click so a household created *after* this component mounted
    // is picked up without a page refresh (the mount effect only runs once). For
    // a signed-in user with no household yet, provision a default one here too
    // so the connect flow just works instead of dead-ending on the wall.
    let activeHouseholdId = householdId;
    if (!activeHouseholdId) {
      const userId = authUser?.id?.trim();
      activeHouseholdId = userId
        ? await ensureDefaultHousehold(db, {
            id: userId,
            name: authUser?.name ?? null,
            email: authUser?.email ?? null,
          }).catch(() => null)
        : await resolveHouseholdId(db).catch(() => null);
      if (activeHouseholdId) setHouseholdId(activeHouseholdId);
    }
    if (!activeHouseholdId) {
      setError('Create a household before connecting a bank.');
      setPhase('error');
      return;
    }
    busyRef.current = true;
    setError(null);
    setPhase('starting');

    try {
      const [
        { ConnectionManager },
        { defaultRegistry },
        { ensureAggregatorProvidersRegistered },
        { openPlaidLink },
      ] = await Promise.all([
        import('../../lib/banking/connection-manager'),
        import('../../lib/banking/provider-registry'),
        import('../../lib/banking/register-aggregator-providers'),
        import('../../lib/banking/plaid-link'),
      ]);

      await ensureAggregatorProvidersRegistered();
      const manager = new ConnectionManager(defaultRegistry);

      const session = await manager.createConnection(PROVIDER_ID, {
        metadata: { household_id: activeHouseholdId },
      });

      await openPlaidLink({
        token: session.sessionId,
        onExit: (err) => {
          busyRef.current = false;
          if (err) {
            setError(err.display_message ?? 'Bank connection was cancelled.');
            setPhase('error');
          } else {
            setPhase('idle');
          }
        },
        onSuccess: (publicToken, metadata) => {
          void (async () => {
            setPhase('finishing');
            try {
              await manager.completeConnection(PROVIDER_ID, session.sessionId, {
                public_token: publicToken,
                institutionId: metadata.institution?.institution_id ?? undefined,
                institutionName: metadata.institution?.name ?? undefined,
                household_id: activeHouseholdId,
              });
              setPhase('idle');
              onConnected?.();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'We could not finish connecting your bank.',
              );
              setPhase('error');
            } finally {
              busyRef.current = false;
            }
          })();
        },
      });
    } catch (e) {
      busyRef.current = false;
      setError(e instanceof Error ? e.message : 'We could not start the bank connection.');
      setPhase('error');
    }
  }, [db, householdId, authUser?.id, authUser?.name, authUser?.email, onConnected]);

  const busy = phase === 'starting' || phase === 'finishing';
  const label =
    phase === 'starting' ? 'Connecting…' : phase === 'finishing' ? 'Finishing…' : 'Connect a bank';

  return (
    <div className="connect-bank">
      <button
        type="button"
        className="connect-bank__button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
      >
        {label}
      </button>
      <span className="connect-bank__status" role="status" aria-live="polite">
        {phase === 'finishing' ? 'Linking your accounts and importing transactions…' : ''}
      </span>
      {error ? (
        <span className="connect-bank__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default ConnectBankButton;
