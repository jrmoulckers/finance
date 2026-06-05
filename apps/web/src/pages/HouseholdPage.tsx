// SPDX-License-Identifier: BUSL-1.1

/**
 * Household management page.
 *
 * Provides household creation, member invitation with privacy-by-default,
 * role management (OWNER, ADMIN, MEMBER, VIEWER), account sharing
 * (mine/yours/ours), shared budget configuration, and shared goals.
 *
 * References: issues #1780, #1779, #1781, #1716, #1784, #1786
 */

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { AppIcon } from '../components/icons';

import { useAuth } from '../auth/auth-context';
import { useToast } from '../components/common/Toast';
import { useHousehold } from '../hooks/useHousehold';
import type { HouseholdRole, AccountSharingMode, SharedBudgetMode } from '../kmp/bridge';
import { ROLE_PERMISSIONS } from '../kmp/bridge';
import { buildInviteUrl, getMemberDisplayName } from '../lib/household/display-name';

import './HouseholdPage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Role options for assignment (excludes OWNER — assigned only on creation). */
const ROLE_OPTIONS: readonly { value: HouseholdRole; label: string; description: string }[] = [
  { value: 'ADMIN', label: 'Admin', description: 'Can manage members and shared finances' },
  { value: 'MEMBER', label: 'Member', description: 'Can view shared data and add transactions' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access to shared data' },
];

const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const SHARING_MODE_LABELS: Record<AccountSharingMode, string> = {
  PRIVATE: 'Private (Mine Only)',
  SHARED: 'Shared (Ours)',
};

const BUDGET_MODE_LABELS: Record<SharedBudgetMode, string> = {
  FLEX: 'Flex (overall limit)',
  CATEGORY: 'Category (per-category limits)',
};

/** Demo account IDs for account sharing toggles. */
const DEMO_ACCOUNT_IDS = ['acct-checking', 'acct-savings', 'acct-credit'];
const DEMO_ACCOUNT_NAMES: Record<string, string> = {
  'acct-checking': 'Checking Account',
  'acct-savings': 'Savings Account',
  'acct-credit': 'Credit Card',
};

/** Demo budget IDs for shared budget configuration. */
const DEMO_BUDGET_IDS = ['budget-groceries', 'budget-dining', 'budget-entertainment'];
const DEMO_BUDGET_NAMES: Record<string, string> = {
  'budget-groceries': 'Groceries',
  'budget-dining': 'Dining Out',
  'budget-entertainment': 'Entertainment',
};

/** Demo goal IDs for shared goals. */
const DEMO_GOAL_IDS = ['goal-vacation', 'goal-emergency', 'goal-car'];
const DEMO_GOAL_NAMES: Record<string, string> = {
  'goal-vacation': 'Family Vacation',
  'goal-emergency': 'Emergency Fund',
  'goal-car': 'New Car',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HouseholdPage() {
  const {
    household,
    members,
    invitations,
    accountSharings,
    sharedBudgets,
    sharedGoals,
    loading,
    error,
    createHousehold,
    inviteMember,
    revokeInvitation,
    updateMemberRole,
    removeMember,
    setAccountSharing,
    setSharedBudget,
    removeSharedBudget,
    setSharedGoal,
    checkPermission,
  } = useHousehold();

  // Issue #1931: pull the auth user as a fallback for the owner's display name
  // (so the user's own entry never shows a raw UUID).
  const authUser = useOptionalAuthUser();

  // Issue #1933: copy the full invite URL on click and confirm via toast.
  const toast = useOptionalToast();

  // -- Create household form state -----------------------------------------
  const [householdName, setHouseholdName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // -- Invite form state ---------------------------------------------------
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<HouseholdRole>('MEMBER');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // -- Handlers ------------------------------------------------------------

  const handleCreateHousehold = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setCreateError(null);

      const trimmed = householdName.trim();
      if (!trimmed) {
        setCreateError('Household name is required.');
        return;
      }

      const result = createHousehold({ name: trimmed });
      if (!result) {
        setCreateError('Failed to create household.');
      }
    },
    [householdName, createHousehold],
  );

  const handleInviteMember = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setInviteError(null);
      setInviteSuccess(false);

      const trimmedEmail = inviteEmail.trim();
      if (!trimmedEmail) {
        setInviteError('Email address is required.');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setInviteError('Please enter a valid email address.');
        return;
      }

      const result = inviteMember({ email: trimmedEmail, role: inviteRole });
      if (result) {
        setInviteEmail('');
        setInviteSuccess(true);
      } else {
        setInviteError('Failed to send invitation.');
      }
    },
    [inviteEmail, inviteRole, inviteMember],
  );

  /**
   * Resolve a member to a human-readable label.
   *
   * For the OWNER specifically we also fall back to the current
   * signed-in user's OAuth name / email so the user's *own* row
   * never displays a raw UUID (issue #1931).
   */
  const resolveMemberName = useCallback(
    (member: { displayName?: string | null; userId?: string | null; role: HouseholdRole }) => {
      const isCurrentUser =
        member.role === 'OWNER' || (authUser?.id && member.userId === authUser.id);
      const profile = isCurrentUser
        ? { name: authUser?.name ?? null, email: authUser?.email ?? null }
        : null;
      return getMemberDisplayName(member, profile);
    },
    [authUser?.id, authUser?.name, authUser?.email],
  );

  /**
   * Click handler for the invite-code chip.
   *
   * Issue #1933: copies the full invite URL (not just the bare code) to
   * the clipboard and shows a brief "Invite link copied" toast.  Falls
   * back to `document.execCommand('copy')` on browsers that don't expose
   * `navigator.clipboard.writeText` (older Safari, file://, http://, etc.).
   */
  const handleCopyInvite = useCallback(
    async (code: string) => {
      const url = buildInviteUrl(code);
      const success = await copyToClipboard(url);
      if (success) {
        toast?.showToast({
          type: 'success',
          message: 'Invite link copied',
          duration: 2000,
        });
      } else {
        toast?.showToast({
          type: 'error',
          message: `Couldn't copy automatically. Copy this link manually: ${url}`,
          duration: 6000,
        });
      }
    },
    [toast],
  );

  // -- Loading state -------------------------------------------------------

  if (loading) {
    return (
      <div className="household-page" role="status" aria-live="polite" aria-label="Loading">
        <p className="household-page__loading">Loading household data…</p>
      </div>
    );
  }

  // -- No household yet — show creation form --------------------------------

  if (!household) {
    return (
      <main className="household-page" aria-labelledby="create-household-title">
        <section className="household-card">
          <h1 id="create-household-title" className="household-card__title">
            Create Your Household
          </h1>
          <p className="household-card__description">
            Set up a household to share budgets and track finances together with family members.
            Privacy-by-default: nothing is shared until you explicitly opt in.
          </p>

          {createError && (
            <div className="household-banner--error" role="alert">
              {createError}
            </div>
          )}

          <form onSubmit={handleCreateHousehold} noValidate>
            <div className="household-form-group">
              <label
                htmlFor="household-name"
                className="household-form-group__label household-form-group__label--required"
              >
                Household Name
              </label>
              <input
                id="household-name"
                className="household-form-input"
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. The Smith Family"
                aria-required="true"
                autoComplete="off"
              />
            </div>
            <button type="submit" className="household-button household-button--primary">
              Create Household
            </button>
          </form>
        </section>
      </main>
    );
  }

  // -- Filter pending invitations for display
  const pendingInvitations = invitations.filter((inv) => inv.status === 'PENDING');

  // -- Household exists — full management UI --------------------------------

  return (
    <main className="household-page" aria-labelledby="household-title">
      {error && (
        <div className="household-banner--error" role="alert">
          {error}
        </div>
      )}

      {/* Header */}
      <header className="household-header">
        <h1 id="household-title" className="household-header__title">
          {household.name}
        </h1>
        <span className="household-header__badge">Family Plan</span>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Members & Roles Section (#1780) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="members-title">
        <h2 id="members-title" className="household-card__title">
          Members &amp; Roles
        </h2>
        <p className="household-card__description">
          Manage household members and their permission levels. Each role determines what actions a
          member can perform.
        </p>

        {members.length === 0 ? (
          <p className="household-card__empty">No members yet.</p>
        ) : (
          <ul className="household-member-list" role="list" aria-label="Household members">
            {members.map((member) => {
              const name = resolveMemberName(member);
              return (
                <li key={member.id} className="household-member-item">
                  <div className="household-member-item__info">
                    <span className="household-member-item__avatar" aria-hidden="true">
                      {member.role === 'OWNER' ? (
                        <AppIcon name="medal" />
                      ) : member.role === 'ADMIN' ? (
                        <AppIcon name="shield" />
                      ) : (
                        <AppIcon name="account" />
                      )}
                    </span>
                    <div>
                      <span className="household-member-item__name">{name}</span>
                      <span className="household-member-item__role">
                        {ROLE_LABELS[member.role]}
                      </span>
                      <span className="household-member-item__permissions">
                        {ROLE_PERMISSIONS[member.role].length} permissions
                      </span>
                    </div>
                  </div>
                  {member.role !== 'OWNER' && (
                    <div className="household-member-item__actions">
                      <select
                        className="household-form-select household-form-select--small"
                        value={member.role}
                        onChange={(e) =>
                          updateMemberRole(member.id, e.target.value as HouseholdRole)
                        }
                        aria-label={`Change role for ${name}`}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="household-button household-button--danger household-button--small"
                        onClick={() => removeMember(member.id)}
                        aria-label={`Remove ${name}`}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Role permissions reference */}
        <details className="household-permissions-details">
          <summary className="household-permissions-summary">View role permissions</summary>
          <div className="household-permissions-grid">
            {(Object.entries(ROLE_LABELS) as [HouseholdRole, string][]).map(([role, label]) => (
              <div key={role} className="household-permissions-column">
                <h4 className="household-permissions-column__title">{label}</h4>
                <ul className="household-permissions-list" role="list">
                  {ROLE_PERMISSIONS[role].map((perm) => (
                    <li key={perm} className="household-permissions-list__item">
                      {perm.replace(/_/g, ' ').toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Invite Section (#1779) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="invite-title">
        <h2 id="invite-title" className="household-card__title">
          Invite Member
        </h2>
        <p className="household-card__description">
          Send an invitation to join your household. New members start with privacy-by-default —
          nothing is shared until they explicitly choose to share accounts.
        </p>

        {inviteSuccess && (
          <div className="household-banner--success" role="status">
            Invitation sent successfully! The invite code has been generated.
          </div>
        )}

        {inviteError && (
          <div className="household-banner--error" role="alert">
            {inviteError}
          </div>
        )}

        <form onSubmit={handleInviteMember} noValidate className="household-invite-form">
          <div className="household-form-group">
            <label htmlFor="invite-email" className="household-form-group__label">
              Email Address
            </label>
            <input
              id="invite-email"
              className="household-form-input"
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteSuccess(false);
              }}
              placeholder="partner@example.com"
              aria-required="true"
              autoComplete="email"
            />
          </div>

          <div className="household-form-group">
            <label htmlFor="invite-role" className="household-form-group__label">
              Role
            </label>
            <select
              id="invite-role"
              className="household-form-select"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as HouseholdRole)}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="household-button household-button--primary">
            Send Invitation
          </button>
        </form>
      </section>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <section className="household-card" aria-labelledby="invitations-title">
          <h2 id="invitations-title" className="household-card__title">
            Pending Invitations
          </h2>
          <p className="household-card__description" id="invitations-helper">
            Send the invite code (or click the code to copy the full invite link) to the person you
            want to share with. They can paste it at <code>/invite</code> or click the link from
            their email.
          </p>
          <ul
            className="household-invitation-list"
            role="list"
            aria-label="Pending invitations"
            aria-describedby="invitations-helper"
          >
            {pendingInvitations.map((inv) => (
              <li key={inv.id} className="household-invitation-item">
                <div className="household-invitation-item__info">
                  <span className="household-invitation-item__email">{inv.email}</span>
                  <span className="household-invitation-item__role">{ROLE_LABELS[inv.role]}</span>
                  <span className="household-invitation-item__code-group">
                    <span
                      className="household-invitation-item__code-label"
                      id={`invite-code-label-${inv.id}`}
                    >
                      Invite code:
                    </span>
                    <button
                      type="button"
                      className="household-invitation-item__code"
                      onClick={() => void handleCopyInvite(inv.inviteCode)}
                      aria-label={`Copy invite link for ${inv.email}`}
                      title="Click to copy the full invite link"
                    >
                      {/*
                        Issue #1932: keep the bare code as the visible label so
                        users still recognise the value being copied.  Issue
                        #1933: clicking copies the full URL, not the bare code.
                      */}
                      <code className="household-invitation-item__code-text">{inv.inviteCode}</code>
                      <span aria-hidden="true" className="household-invitation-item__code-hint">
                        Copy link
                      </span>
                    </button>
                  </span>
                  <span className="household-invitation-item__status">{inv.status}</span>
                </div>
                <button
                  className="household-button household-button--secondary household-button--small"
                  onClick={() => revokeInvitation(inv.id)}
                  aria-label={`Revoke invitation for ${inv.email}`}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Account Sharing — Mine/Yours/Ours (#1781, #1716) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="account-sharing-title">
        <h2 id="account-sharing-title" className="household-card__title">
          Account Sharing
        </h2>
        <p className="household-card__description">
          Choose which accounts are shared with the household and which stay private. Private
          accounts are completely hidden from other household members (mine only). Shared accounts
          are visible to all members (ours).
        </p>
        <ul className="household-sharing-list" role="list" aria-label="Account sharing settings">
          {DEMO_ACCOUNT_IDS.map((accountId) => {
            const sharing = accountSharings.find((as) => as.accountId === accountId);
            const mode: AccountSharingMode = sharing?.sharingMode ?? 'PRIVATE';
            const isShared = mode === 'SHARED';
            return (
              <li key={accountId} className="household-sharing-item">
                <div className="household-sharing-item__info">
                  <span className="household-sharing-item__name">
                    {DEMO_ACCOUNT_NAMES[accountId]}
                  </span>
                  <span
                    className={`household-sharing-item__badge ${isShared ? 'household-sharing-item__badge--shared' : 'household-sharing-item__badge--private'}`}
                  >
                    {isShared ? (
                      <>
                        <AppIcon name="unlock" /> Shared
                      </>
                    ) : (
                      <>
                        <AppIcon name="lock" /> Private
                      </>
                    )}
                  </span>
                </div>
                <button
                  className={`household-toggle ${isShared ? 'household-toggle--active' : ''}`}
                  role="switch"
                  aria-checked={isShared}
                  aria-label={`Toggle sharing for ${DEMO_ACCOUNT_NAMES[accountId]}`}
                  onClick={() =>
                    setAccountSharing({
                      accountId,
                      sharingMode: isShared ? 'PRIVATE' : 'SHARED',
                    })
                  }
                >
                  <span className="household-toggle__track">
                    <span className="household-toggle__thumb" />
                  </span>
                  <span className="household-toggle__label">{SHARING_MODE_LABELS[mode]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="household-card__note" role="note">
          <strong>Privacy boundary:</strong> Private ("mine only") accounts, transactions, and
          balances are completely invisible to other household members. This is enforced at the data
          layer, not just the UI.
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Shared Budgets (#1784) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="shared-budgets-title">
        <h2 id="shared-budgets-title" className="household-card__title">
          Shared Budgets
        </h2>
        <p className="household-card__description">
          Configure budgets that are shared with the household. Choose between flex mode (one
          overall spending limit) or category mode (per-category limits).
        </p>
        <ul className="household-budget-list" role="list" aria-label="Shared budget settings">
          {DEMO_BUDGET_IDS.map((budgetId) => {
            const shared = sharedBudgets.find((sb) => sb.budgetId === budgetId);
            const isActive = shared?.isActive ?? false;
            const mode: SharedBudgetMode = shared?.mode ?? 'CATEGORY';
            return (
              <li key={budgetId} className="household-budget-item">
                <div className="household-budget-item__info">
                  <span className="household-budget-item__name">{DEMO_BUDGET_NAMES[budgetId]}</span>
                  {isActive && (
                    <span className="household-budget-item__mode">{BUDGET_MODE_LABELS[mode]}</span>
                  )}
                </div>
                <div className="household-budget-item__controls">
                  {isActive && (
                    <select
                      className="household-form-select household-form-select--small"
                      value={mode}
                      onChange={(e) =>
                        setSharedBudget({
                          budgetId,
                          mode: e.target.value as SharedBudgetMode,
                        })
                      }
                      aria-label={`Budget mode for ${DEMO_BUDGET_NAMES[budgetId]}`}
                    >
                      <option value="FLEX">Flex</option>
                      <option value="CATEGORY">Category</option>
                    </select>
                  )}
                  <button
                    className={`household-toggle ${isActive ? 'household-toggle--active' : ''}`}
                    role="switch"
                    aria-checked={isActive}
                    aria-label={`Toggle sharing for ${DEMO_BUDGET_NAMES[budgetId]}`}
                    onClick={() => {
                      if (isActive && shared) {
                        removeSharedBudget(shared.id);
                      } else {
                        setSharedBudget({ budgetId, mode });
                      }
                    }}
                  >
                    <span className="household-toggle__track">
                      <span className="household-toggle__thumb" />
                    </span>
                    <span className="household-toggle__label">
                      {isActive ? 'Shared' : 'Personal'}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Shared Goals (#1786) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="shared-goals-title">
        <h2 id="shared-goals-title" className="household-card__title">
          Shared Goals
        </h2>
        <p className="household-card__description">
          Share savings goals with the household so everyone can track progress together. Per-member
          contribution tracking shows who contributed what.
        </p>
        <ul className="household-goal-list" role="list" aria-label="Shared goal settings">
          {DEMO_GOAL_IDS.map((goalId) => {
            const shared = sharedGoals.find((sg) => sg.goalId === goalId);
            const isShared = shared?.isShared ?? false;
            return (
              <li key={goalId} className="household-goal-item">
                <div className="household-goal-item__info">
                  <span className="household-goal-item__name">{DEMO_GOAL_NAMES[goalId]}</span>
                  {isShared && (
                    <span className="household-goal-item__badge">Shared with household</span>
                  )}
                </div>
                <button
                  className={`household-toggle ${isShared ? 'household-toggle--active' : ''}`}
                  role="switch"
                  aria-checked={isShared}
                  aria-label={`Toggle sharing for ${DEMO_GOAL_NAMES[goalId]}`}
                  onClick={() => setSharedGoal({ goalId, isShared: !isShared })}
                >
                  <span className="household-toggle__track">
                    <span className="household-toggle__thumb" />
                  </span>
                  <span className="household-toggle__label">
                    {isShared ? 'Shared' : 'Personal'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Permission Check Demo (dev reference) */}
      {/* ----------------------------------------------------------------- */}
      <section className="household-card" aria-labelledby="permissions-demo-title">
        <h2 id="permissions-demo-title" className="household-card__title">
          Permission Reference
        </h2>
        <p className="household-card__description">
          Quick reference for what each role can do in this household.
        </p>
        <div className="household-permissions-table-wrap">
          <table className="household-permissions-table" aria-label="Role permissions matrix">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                {(Object.keys(ROLE_LABELS) as HouseholdRole[]).map((role) => (
                  <th key={role} scope="col">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  'MANAGE_MEMBERS',
                  'INVITE_MEMBERS',
                  'MANAGE_ROLES',
                  'VIEW_SHARED_ACCOUNTS',
                  'EDIT_SHARED_ACCOUNTS',
                  'CREATE_SHARED_BUDGETS',
                  'VIEW_SHARED_BUDGETS',
                  'CREATE_SHARED_GOALS',
                  'VIEW_SHARED_GOALS',
                  'ADD_TRANSACTIONS',
                ] as const
              ).map((perm) => (
                <tr key={perm}>
                  <td>{perm.replace(/_/g, ' ').toLowerCase()}</td>
                  {(Object.keys(ROLE_LABELS) as HouseholdRole[]).map((role) => (
                    <td key={role} className="household-permissions-table__cell">
                      {checkPermission(role, perm) ? (
                        <span aria-label="Allowed" title="Allowed">
                          <AppIcon name="check" />
                        </span>
                      ) : (
                        <span aria-label="Denied" title="Denied">
                          <AppIcon name="x" />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default HouseholdPage;

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Read the auth user without throwing if no AuthProvider is mounted.
 *
 * `useAuth()` is intentionally strict (throws on misuse) so production
 * callers fail loudly, but a handful of unit tests render the page
 * without wrapping it in `<AuthProvider>`.  We swallow that error and
 * fall back to `null`; the display-name resolver handles a missing
 * profile gracefully by falling back to `member.displayName` /
 * truncated UUID.
 *
 * Issue #1931.
 */
function useOptionalAuthUser(): { id: string; email: string; name?: string } | null {
  try {
    return useAuth().user;
  } catch {
    return null;
  }
}

/**
 * Read the toast API without throwing if no ToastProvider is mounted.
 *
 * Same rationale as {@link useOptionalAuthUser}: we don't want to force
 * every test render to wrap children in `<ToastProvider>`, and a missing
 * toast is a soft degradation (clipboard write still succeeds; the user
 * just doesn't see the confirmation).
 *
 * Issue #1933.
 */
function useOptionalToast(): ReturnType<typeof useToast> | null {
  try {
    return useToast();
  } catch {
    return null;
  }
}

/**
 * Copy `text` to the clipboard.
 *
 * Uses `navigator.clipboard.writeText` when available (modern browsers,
 * secure contexts) and falls back to the legacy `document.execCommand`
 * shim otherwise.  Returns `true` on success.
 *
 * Issue #1933.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy shim below.
  }

  try {
    if (typeof document === 'undefined') return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
