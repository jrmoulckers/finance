// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useState } from 'react';

import { useAuth } from '../../auth/auth-context';
import { useDatabase } from '../../db/DatabaseProvider';
import {
  clearLocalAccountData,
  getHouseholdDeletionImpact,
  type HouseholdDeletionImpact,
} from '../../lib/account/account-deletion';

const ACCOUNT_DELETED_FLASH_KEY = 'finance:account-deleted-flash';

/**
 * Tolerate missing DatabaseProvider (e.g. in some test harnesses).
 */
function useOptionalDatabase() {
  try {
    return useDatabase();
  } catch {
    return null;
  }
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
  const { isAuthenticated, user } = useAuth();
  const db = useOptionalDatabase();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [householdImpact, setHouseholdImpact] = useState<HouseholdDeletionImpact>({
    soloOwnedHouseholds: 0,
    memberHouseholds: 0,
    pendingInvites: 0,
  });

  const openDeleteModal = useCallback(() => {
    setConfirmationText('');
    setError(null);
    setIsOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (isDeleting) return;
    setIsOpen(false);
    setConfirmationText('');
    setError(null);
  }, [isDeleting]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      setHouseholdImpact(getHouseholdDeletionImpact(db, user?.id));
    } catch {
      setHouseholdImpact({ soloOwnedHouseholds: 0, memberHouseholds: 0, pendingInvites: 0 });
    }
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

    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch('/api/account/delete-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });

      // Issue #1960 — the production Caddy config used to be missing the
      // `/api/account/*` proxy rule, so this fetch fell through to the
      // SPA fallback and returned 200 OK with an HTML body. The client
      // happily treated that as "success" and cleared the local cache
      // while the server had not deleted a single row.
      //
      // Guard against any future regression of that nature by insisting
      // the response is either 204 (success contract — see the edge
      // function), or a non-HTML payload with a 2xx status.
      const contentType = response.headers.get('Content-Type') ?? '';
      const looksLikeHtml = contentType.includes('text/html');
      if (!response.ok || looksLikeHtml) {
        throw new Error('Account deletion failed.');
      }

      await clearLocalAccountData(db);
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem(ACCOUNT_DELETED_FLASH_KEY, 'Your account has been deleted.');
      window.location.assign('/login?accountDeleted=1');
    } catch {
      setError("Couldn't delete account — please try again or contact support.");
      setIsDeleting(false);
    }
  }, [db, confirmationText, isAuthenticated, isDeleting]);

  const deleteModal = isOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-description"
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
          borderRadius: 'var(--radius-lg, 1rem)',
          padding: 'var(--spacing-6, 1.5rem)',
          background: 'var(--semantic-surface-primary, var(--color-surface))',
          boxShadow: 'var(--shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.28))',
        }}
      >
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
              {householdImpact.soloOwnedHouseholds === 1 ? '' : 's'} you solely own will be deleted
              entirely — any other invited members lose access.
            </li>
          )}
          {householdImpact.memberHouseholds > 0 && (
            <li>
              You will be removed from {householdImpact.memberHouseholds} shared household
              {householdImpact.memberHouseholds === 1 ? '' : 's'}. The household itself stays, but
              every transaction, budget, goal, account, and category you contributed there is
              deleted. Data owned by other members is untouched.
            </li>
          )}
          {householdImpact.pendingInvites > 0 && (
            <li>
              {householdImpact.pendingInvites} pending invitation
              {householdImpact.pendingInvites === 1 ? '' : 's'} you sent will be revoked.
            </li>
          )}
          <li>
            Your sign-in identity (Google / Apple / email / passkey) is unlinked. Signing in again
            creates a brand-new empty account.
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
      </div>
    </div>
  ) : null;

  return { openDeleteModal, deleteModal };
}
