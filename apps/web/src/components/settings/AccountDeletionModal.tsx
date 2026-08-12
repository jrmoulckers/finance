// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../accessibility/aria';

import { useAuth } from '../../auth/auth-context';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  clearLocalAccountData,
  getHouseholdDeletionImpact,
  type HouseholdDeletionImpact,
} from '../../lib/account/account-deletion';
import { wipeLocalData } from '../../storage/wipeLocalData';
import { appendSecurityAuditEvent } from '../../lib/security-audit-log';
import { getStepUpStatus, markStepUpAuthenticated } from '../../lib/session-security';
import {
  deletionResult,
  serializeDeletionReceipt,
  verifyAccountDeletion,
  type DeletionDomain,
  type DeletionDomainResult,
  type DeletionReceipt,
} from '../../lib/security/deletion-verification';
import {
  mapAccountDeletionEndpointResponse,
  type AccountDeletionReceiptContract,
} from '../../lib/security/deletion-endpoint';
import {
  buildLocalWipeReceipt,
  type LocalWipeArea,
  type LocalWipeReceipt,
} from '../../lib/security/local-wipe-verification';

/**
 * Tolerate missing DatabaseProvider (e.g. in some test harnesses).
 */
function useOptionalDatabase() {
  try {
    // eslint-disable-next-line finance/no-hook-call-in-try -- provider-tolerance pattern, tracked in #4248
    return useDatabase();
  } catch {
    return null;
  }
}

interface AccountDeletionReceiptState {
  readonly receipt: DeletionReceipt & { readonly verificationHash: string };
  readonly serialized: string;
  readonly verificationHash: string;
  readonly localWipeMessage: string;
}

const LOCAL_WIPE_DOMAIN_BY_AREA: Record<LocalWipeArea, DeletionDomain> = {
  opfs: 'local-opfs',
  indexeddb: 'local-indexeddb',
  caches: 'local-caches',
  'service-workers': 'local-service-workers',
  'local-storage': 'local-storage',
  'session-storage': 'session-storage',
  'sync-queues': 'sync-queues',
  'audit-log': 'audit-log',
  'consent-records': 'consent-records',
};

function buildDeletionDomainResults(
  endpointReceipt: AccountDeletionReceiptContract,
  localWipeReceipt: LocalWipeReceipt,
): readonly DeletionDomainResult[] {
  const results = new Map<DeletionDomain, DeletionDomainResult>();

  for (const domain of endpointReceipt.deletedDomains) {
    results.set(domain, deletionResult(domain, 'deleted'));
  }
  for (const domain of endpointReceipt.failedDomains) {
    results.set(
      domain,
      deletionResult(
        domain,
        'failed',
        'Server deletion endpoint reported this domain as incomplete.',
      ),
    );
  }
  for (const area of localWipeReceipt.deleted) {
    results.set(
      LOCAL_WIPE_DOMAIN_BY_AREA[area],
      deletionResult(LOCAL_WIPE_DOMAIN_BY_AREA[area], 'deleted'),
    );
  }
  for (const area of localWipeReceipt.notApplicable) {
    results.set(
      LOCAL_WIPE_DOMAIN_BY_AREA[area],
      deletionResult(LOCAL_WIPE_DOMAIN_BY_AREA[area], 'not_applicable'),
    );
  }
  for (const failure of localWipeReceipt.failed) {
    const domain = LOCAL_WIPE_DOMAIN_BY_AREA[failure.area];
    results.set(
      domain,
      deletionResult(domain, 'failed', failure.detail ?? 'Local wipe verification failed.'),
    );
  }

  return [...results.values()];
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return typeof response.text === 'function' ? await response.text() : '';
  } catch {
    return '';
  }
}

function receiptDownloadHref(serializedReceipt: string): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(serializedReceipt)}`;
}

function receiptFileName(requestId: string): string {
  return `finance-account-deletion-receipt-${requestId.replace(/[^a-z0-9._-]/gi, '-')}.json`;
}

/**
 * Hook that owns the typed-DELETE account deletion flow.
 *
 * Returns an `openDeleteModal` trigger and a `deleteModal` element to render.
 * The modal handles the typed confirmation, household impact summary, and
 * the actual deletion request — identical to the legacy SettingsPage flow.
 */
export function useAccountDeletion(): {
  openDeleteModal: () => void;
  deleteModal: React.ReactElement | null;
} {
  const { isAuthenticated, logout, user } = useAuth();
  const db = useOptionalDatabase();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completionReceipt, setCompletionReceipt] = useState<AccountDeletionReceiptState | null>(
    null,
  );
  const [householdImpact, setHouseholdImpact] = useState<HouseholdDeletionImpact>({
    soloOwnedHouseholds: 0,
    memberHouseholds: 0,
    pendingInvites: 0,
  });
  const dialogRef = useRef<HTMLDivElement>(null);

  const openDeleteModal = useCallback(() => {
    setConfirmationText('');
    setError(null);
    setCompletionReceipt(null);
    setIsOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (isDeleting || completionReceipt) return;
    setIsOpen(false);
    setConfirmationText('');
    setError(null);
  }, [completionReceipt, isDeleting]);

  // Trap focus within the modal, move initial focus into it, and restore focus
  // to the trigger element on close (issue #3331). closeDeleteModal is itself
  // guarded so Escape cannot dismiss the modal mid-deletion or after the
  // receipt is shown.
  useFocusTrap(dialogRef, { active: isOpen, restoreFocus: true });

  const handleDialogKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDeleteModal();
      }
    },
    [closeDeleteModal],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const impact = await getHouseholdDeletionImpact(db, user?.id);
        if (!cancelled) setHouseholdImpact(impact);
      } catch {
        if (!cancelled) {
          setHouseholdImpact({ soloOwnedHouseholds: 0, memberHouseholds: 0, pendingInvites: 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, isOpen, user?.id]);

  const handleAccountDelete = useCallback(async () => {
    // Defense-in-depth: even though the destructive button is disabled
    // when the typed token does not match, re-check here in case the
    // disabled attribute is bypassed via devtools or assistive tech
    // (issue #1961). The server also independently re-validates the
    // confirmation in services/api/supabase/functions/account-delete.
    if (!isAuthenticated || confirmationText !== 'DELETE' || isDeleting) {
      return;
    }

    const requestedAt = new Date().toISOString();
    setError(null);
    setIsDeleting(true);

    try {
      const stepUp = getStepUpStatus('account_deletion');
      if (!stepUp.allowed) {
        await markStepUpAuthenticated('account_deletion', { source: 'account-deletion-modal' });
      }
      await appendSecurityAuditEvent({ action: 'account_deletion_attempted', result: 'warning' });

      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      const endpointReceipt = mapAccountDeletionEndpointResponse(
        response,
        await readResponseText(response),
        new Date().toISOString(),
      );
      if (endpointReceipt.status !== 'success') {
        throw new Error(endpointReceipt.privacySafeMessage);
      }

      await clearLocalAccountData(db);
      await db?.close().catch(() => undefined);
      const localWipeReceipt = buildLocalWipeReceipt('online', await wipeLocalData());
      const verification = verifyAccountDeletion({
        requestId: endpointReceipt.requestId,
        requestedAt,
        completedAt: new Date().toISOString(),
        serverConfirmed: endpointReceipt.status === 'success',
        domains: buildDeletionDomainResults(endpointReceipt, localWipeReceipt),
      });
      const completionEvent = await appendSecurityAuditEvent({
        action: 'account_deletion_completed',
        result: verification.verified ? 'success' : 'warning',
        metadata: {
          requestId: verification.receipt.requestId,
          verified: verification.verified,
          deletedDomains: verification.receipt.deletedDomains,
          failedDomains: verification.failedDomains,
        },
      });
      const receipt = { ...verification.receipt, verificationHash: completionEvent.hash };
      setCompletionReceipt({
        receipt,
        serialized: serializeDeletionReceipt(receipt),
        verificationHash: completionEvent.hash,
        localWipeMessage: localWipeReceipt.userCopy,
      });
      setConfirmationText('');
      setIsDeleting(false);
    } catch {
      setError("Couldn't delete account. Please try again or contact support.");
      setIsDeleting(false);
    }
  }, [db, confirmationText, isAuthenticated, isDeleting, logout]);

  const continueToLogin = useCallback(async () => {
    try {
      await logout();
    } catch {
      // The account-delete endpoint already revoked the session; continue to login.
    }
    window.location.assign('/login');
  }, [logout]);

  const deleteModal = isOpen ? (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-description"
      onKeyDown={handleDialogKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--spacing-4, 1rem)',
        background: 'rgba(15, 23, 42, 0.72)',
      }}
    >
      <div
        style={{
          width: 'min(100%, 36rem)',
          borderRadius: 'var(--border-radius-lg, 1rem)',
          padding: 'var(--spacing-6, 1.5rem)',
          background: 'var(--semantic-background-primary, var(--color-surface))',
          boxShadow: 'var(--shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.28))',
        }}
      >
        {completionReceipt ? (
          <>
            <h3 id="delete-account-title" className="settings-group__title">
              Account deletion receipt
            </h3>
            <p id="delete-account-description" className="settings-item__description">
              Your account deletion completed. Save this verification receipt before leaving this
              page; it contains only domain-level deletion status and audit proof metadata.
            </p>
            <dl className="settings-item__description">
              <div>
                <dt>Completed at</dt>
                <dd>{completionReceipt.receipt.completedAt}</dd>
              </div>
              <div>
                <dt>Verification hash</dt>
                <dd style={{ overflowWrap: 'anywhere' }}>{completionReceipt.verificationHash}</dd>
              </div>
            </dl>
            <p className="settings-item__description">{completionReceipt.localWipeMessage}</p>
            <ul aria-label="Deleted domains" className="settings-item__description">
              {completionReceipt.receipt.deletedDomains.map((domain) => (
                <li key={domain}>{domain}</li>
              ))}
            </ul>
            {(completionReceipt.receipt.failures.length > 0 ||
              completionReceipt.receipt.retained.length > 0) && (
              <p role="alert" style={{ color: 'var(--semantic-warning, #b45309)' }}>
                Some deletion domains need follow-up; view or download the receipt for details.
              </p>
            )}
            <details className="settings-item__description">
              <summary>View verification receipt</summary>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {completionReceipt.serialized}
              </pre>
            </details>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--spacing-3, 0.75rem)',
                marginTop: 'var(--spacing-5, 1.25rem)',
              }}
            >
              <a
                className="settings-account-delete__cancel-button settings-account-delete__cancel-button--secondary"
                href={receiptDownloadHref(completionReceipt.serialized)}
                download={receiptFileName(completionReceipt.receipt.requestId)}
                style={{
                  border: '1px solid var(--semantic-border-primary, #d1d5db)',
                  background: 'transparent',
                  color: 'var(--semantic-text-secondary, #475569)',
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                  textDecoration: 'none',
                }}
              >
                Download receipt
              </a>
              <button
                type="button"
                className="settings-account-delete__confirm-button settings-account-delete__confirm-button--danger"
                onClick={() => {
                  void continueToLogin();
                }}
                style={{
                  border: '1px solid var(--semantic-danger, #dc2626)',
                  background: 'var(--semantic-danger, #dc2626)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                }}
              >
                Continue to login
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="delete-account-title" className="settings-group__title">
              Delete account and all data
            </h3>
            <p id="delete-account-description" className="settings-item__description">
              This permanently deletes your account, personal finance data, passkeys, connected bank
              links, audit entries, and authentication record. This cannot be undone.
            </p>
            {/*
          Household + shared-data consequences (issue #1962).
          The wording is mirrored by the server-side policy in
          services/api/supabase/functions/account-delete/index.ts —
          update both together.
        */}
            <ul aria-label="What will be deleted" className="settings-item__description">
              <li>
                All your personal accounts, transactions, budgets, goals, categories, settings, and
                audit records will be permanently deleted.
              </li>
              {householdImpact.soloOwnedHouseholds > 0 && (
                <li>
                  {householdImpact.soloOwnedHouseholds} household
                  {householdImpact.soloOwnedHouseholds === 1 ? '' : 's'} you solely own will be
                  deleted entirely, and any other invited members lose access.
                </li>
              )}
              {householdImpact.memberHouseholds > 0 && (
                <li>
                  You will be removed from {householdImpact.memberHouseholds} shared household
                  {householdImpact.memberHouseholds === 1 ? '' : 's'}. The household itself stays,
                  but every transaction, budget, goal, account, and category you contributed there
                  is deleted. Data owned by other members is untouched.
                </li>
              )}
              {householdImpact.pendingInvites > 0 && (
                <li>
                  {householdImpact.pendingInvites} pending invitation
                  {householdImpact.pendingInvites === 1 ? '' : 's'} you sent will be revoked.
                </li>
              )}
              <li>
                Your sign-in identity (Google / Apple / email / passkey) is unlinked. Signing in
                again creates a brand-new empty account.
              </li>
              <li>This action cannot be undone.</li>
            </ul>
            <label className="settings-item__label" htmlFor="delete-account-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-account-confirmation"
              className="form-input settings-item__input"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              aria-describedby="delete-account-confirmation-help"
            />
            <p
              id="delete-account-confirmation-help"
              className="settings-item__description"
              style={{ marginTop: 'var(--spacing-1, 0.25rem)' }}
            >
              The deletion button stays disabled until you type the word DELETE exactly.
            </p>
            {error && (
              <p role="alert" style={{ color: 'var(--semantic-danger, #dc2626)' }}>
                {error}
              </p>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--spacing-3, 0.75rem)',
                marginTop: 'var(--spacing-5, 1.25rem)',
              }}
            >
              <button
                type="button"
                className="settings-account-delete__cancel-button settings-account-delete__cancel-button--secondary"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                style={{
                  border: '1px solid var(--semantic-border-primary, #d1d5db)',
                  background: 'transparent',
                  color: 'var(--semantic-text-secondary, #475569)',
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-account-delete__confirm-button settings-account-delete__confirm-button--danger"
                onClick={() => {
                  void handleAccountDelete();
                }}
                disabled={confirmationText !== 'DELETE' || isDeleting}
                aria-disabled={confirmationText !== 'DELETE' || isDeleting}
                style={{
                  border: '1px solid var(--semantic-danger, #dc2626)',
                  background: 'var(--semantic-danger, #dc2626)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '0.625rem 1rem',
                  borderRadius: 'var(--radius-md, 0.5rem)',
                  opacity: confirmationText !== 'DELETE' || isDeleting ? 0.55 : 1,
                  cursor: confirmationText !== 'DELETE' || isDeleting ? 'not-allowed' : 'pointer',
                }}
              >
                {isDeleting ? 'Deleting…' : 'Yes, Delete Everything'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  return { openDeleteModal, deleteModal };
}
