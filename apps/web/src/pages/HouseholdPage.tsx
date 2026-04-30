// SPDX-License-Identifier: BUSL-1.1

/**
 * Family/Household Plan page.
 *
 * Provides household creation, member invitation, role management,
 * and shared vs personal budget toggling.
 *
 * References: issue #339
 */

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';

import { useHousehold } from '../hooks/useHousehold';
import type { HouseholdRole } from '../kmp/bridge';

import './HouseholdPage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: readonly { value: HouseholdRole; label: string; description: string }[] = [
  { value: 'PARTNER', label: 'Partner', description: 'Full access to all shared finances' },
  { value: 'MEMBER', label: 'Member', description: 'Can view and add transactions' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access to shared data' },
];

const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Owner',
  PARTNER: 'Partner',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HouseholdPage() {
  const {
    household,
    members,
    invitations,
    budgetVisibility,
    loading,
    error,
    createHousehold,
    inviteMember,
    revokeInvitation,
    updateMemberRole,
    removeMember,
    toggleBudgetVisibility,
  } = useHousehold();

  // -- Create household form state -----------------------------------------
  const [householdName, setHouseholdName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // -- Invite form state ---------------------------------------------------
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<HouseholdRole>('MEMBER');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // -- Budget IDs for demo toggle ------------------------------------------
  const demoBudgetIds = ['budget-1', 'budget-2', 'budget-3'];

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

      {/* Members Section */}
      <section className="household-card" aria-labelledby="members-title">
        <h2 id="members-title" className="household-card__title">
          Members
        </h2>

        {members.length === 0 ? (
          <p className="household-card__empty">No members yet.</p>
        ) : (
          <ul className="household-member-list" role="list" aria-label="Household members">
            {members.map((member) => (
              <li key={member.id} className="household-member-item">
                <div className="household-member-item__info">
                  <span className="household-member-item__avatar" aria-hidden="true">
                    {member.role === 'OWNER' ? '👑' : '👤'}
                  </span>
                  <div>
                    <span className="household-member-item__name">
                      {member.userId.slice(0, 8)}…
                    </span>
                    <span className="household-member-item__role">{ROLE_LABELS[member.role]}</span>
                  </div>
                </div>
                {member.role !== 'OWNER' && (
                  <div className="household-member-item__actions">
                    <select
                      className="household-form-select household-form-select--small"
                      value={member.role}
                      onChange={(e) => updateMemberRole(member.id, e.target.value as HouseholdRole)}
                      aria-label={`Change role for member ${member.userId.slice(0, 8)}`}
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
                      aria-label={`Remove member ${member.userId.slice(0, 8)}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Invite Section */}
      <section className="household-card" aria-labelledby="invite-title">
        <h2 id="invite-title" className="household-card__title">
          Invite Member
        </h2>

        {inviteSuccess && (
          <div className="household-banner--success" role="status">
            Invitation sent successfully!
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
      {invitations.length > 0 && (
        <section className="household-card" aria-labelledby="invitations-title">
          <h2 id="invitations-title" className="household-card__title">
            Pending Invitations
          </h2>
          <ul className="household-invitation-list" role="list" aria-label="Pending invitations">
            {invitations.map((inv) => (
              <li key={inv.id} className="household-invitation-item">
                <div className="household-invitation-item__info">
                  <span className="household-invitation-item__email">{inv.email}</span>
                  <span className="household-invitation-item__role">{ROLE_LABELS[inv.role]}</span>
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

      {/* Shared vs Personal Budgets */}
      <section className="household-card" aria-labelledby="budget-visibility-title">
        <h2 id="budget-visibility-title" className="household-card__title">
          Budget Sharing
        </h2>
        <p className="household-card__description">
          Toggle budgets between shared (visible to all members) and personal (only you).
        </p>
        <ul className="household-budget-list" role="list" aria-label="Budget visibility settings">
          {demoBudgetIds.map((budgetId) => {
            const vis = budgetVisibility.find((bv) => bv.budgetId === budgetId);
            const isShared = vis?.isShared ?? false;
            return (
              <li key={budgetId} className="household-budget-item">
                <span className="household-budget-item__name">Budget {budgetId.slice(-1)}</span>
                <button
                  className={`household-toggle ${isShared ? 'household-toggle--active' : ''}`}
                  role="switch"
                  aria-checked={isShared}
                  aria-label={`Toggle sharing for Budget ${budgetId.slice(-1)}`}
                  onClick={() => toggleBudgetVisibility(budgetId)}
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
    </main>
  );
}

export default HouseholdPage;
