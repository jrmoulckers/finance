// SPDX-License-Identifier: BUSL-1.1

/**
 * AcceptInvitePage — household invitation acceptance screen (#3377).
 *
 * Opened via the shareable invite link (`/invite/<code>`) the inviter copies
 * from the Household page, or via `/invite` where an invitee can paste a code by
 * hand. It looks the invitation up in the encrypted, synced household store (so
 * it resolves on the invitee's *own* device) and lets them join from there —
 * closing the loop that previously dead-ended because no route opened the link
 * and nothing ever called `acceptInvitation`.
 *
 * The screen is deliberately standalone (no app nav shell) so it reads cleanly
 * when reached straight from an email link, and every branch renders accessible,
 * status-specific messaging (not-found vs expired vs revoked vs already-joined)
 * with focus moved to the heading on each state change.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FC, FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useHousehold } from '../hooks/useHousehold';
import type { AcceptInvitationResult } from '../hooks/useHousehold';
import type { HouseholdInvitation, HouseholdRole } from '../kmp/bridge';
import '../styles/auth.css';
import '../styles/invite.css';

/** Human-readable labels for each household role shown on the accept screen. */
const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer (read-only)',
};

/** Terminal states that render a single status message with return links. */
type TerminalView = 'not_found' | 'revoked' | 'expired' | 'already_accepted';

const TERMINAL_MESSAGES: Record<TerminalView, { title: string; body: string }> = {
  not_found: {
    title: 'Invitation not found',
    body: "We couldn't find that invitation. The link may be mistyped, already used, or not synced to this device yet. Ask whoever invited you to resend it.",
  },
  revoked: {
    title: 'Invitation revoked',
    body: 'This invitation was revoked by the household owner. Ask them to send you a new one.',
  },
  expired: {
    title: 'Invitation expired',
    body: 'This invitation has expired. Ask the household owner to send you a fresh invite.',
  },
  already_accepted: {
    title: 'Already accepted',
    body: 'This invitation has already been accepted. If that was you, head to your household to get started.',
  },
};

/**
 * Household invitation acceptance page.
 *
 * Reads the `:code` route param, resolves the invitation from the synced
 * household store, and renders the appropriate state. Requires an authenticated
 * session (mounted under an authenticated route) because the invitation only
 * exists in the invitee's encrypted local store once they have signed in and
 * synced.
 */
export const AcceptInvitePage: FC = () => {
  const { code: codeParam } = useParams<{ code?: string }>();
  const code = codeParam?.trim() ?? '';
  const navigate = useNavigate();
  const { household, loading, getInvitationByCode, acceptInvitation } = useHousehold();

  const [result, setResult] = useState<AcceptInvitationResult | null>(null);
  const [pastedCode, setPastedCode] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The invitation lookup is async under the AsyncDb data layer, so it is
  // resolved into state via an effect. `undefined` marks "not resolved yet"
  // (keep showing the checking state) and is distinct from `null` ("resolved:
  // no matching invitation"), so we never flash a not-found message mid-load.
  const [invitation, setInvitation] = useState<HouseholdInvitation | null | undefined>(undefined);

  useEffect(() => {
    if (!code) {
      setInvitation(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const found = await getInvitationByCode(code);
        if (!cancelled) setInvitation(found);
      } catch {
        if (!cancelled) setInvitation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, getInvitationByCode]);

  // Move focus to the heading whenever the rendered state changes so keyboard
  // and screen-reader users always land on the new message.
  useEffect(() => {
    headingRef.current?.focus();
  }, [code, result, loading, invitation]);

  const handleAccept = useCallback(() => {
    void (async () => {
      setResult(await acceptInvitation(code));
    })();
  }, [acceptInvitation, code]);

  const handlePasteSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      const next = pastedCode.trim();
      if (next) {
        navigate(`/invite/${encodeURIComponent(next)}`);
      }
    },
    [navigate, pastedCode],
  );

  const householdName =
    invitation && household && household.id === invitation.householdId ? household.name : null;

  const renderCard = (title: string, body: ReactNode) => (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="invite-title">
        <header className="auth-brand">
          <h1 id="invite-title" className="auth-brand__name" tabIndex={-1} ref={headingRef}>
            {title}
          </h1>
        </header>
        {body}
      </section>
    </main>
  );

  // --- No code in the URL: let the invitee paste one (helper text points here) -
  if (!code) {
    return renderCard(
      'Join a household',
      <>
        <p className="auth-brand__tagline">
          Paste the invite code the household owner shared with you.
        </p>
        <form className="auth-form" onSubmit={handlePasteSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="invite-code" className="auth-field__label">
              Invite code
            </label>
            <input
              id="invite-code"
              className="auth-field__input"
              value={pastedCode}
              onChange={(event) => setPastedCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-required="true"
            />
          </div>
          <div className="auth-actions">
            <button type="submit" className="auth-submit" disabled={pastedCode.trim().length === 0}>
              Continue
            </button>
          </div>
        </form>
        <p className="auth-footer">
          <Link to="/dashboard" className="auth-footer__link">
            Back to dashboard
          </Link>
        </p>
      </>,
    );
  }

  // --- Still loading the store: avoid flashing "not found" before it settles ---
  if ((loading || invitation === undefined) && !result) {
    return renderCard(
      'Checking your invitation…',
      <p className="auth-brand__tagline" role="status">
        One moment while we look up this invite.
      </p>,
    );
  }

  // --- Success: joined now, or already a member ------------------------------
  if (result && (result.status === 'ACCEPTED' || result.status === 'ALREADY_MEMBER')) {
    const joinedName = householdName ?? 'your shared household';
    return renderCard(
      result.status === 'ACCEPTED' ? "You're in!" : 'Already joined',
      <>
        <p className="auth-brand__tagline" role="status">
          {result.status === 'ACCEPTED'
            ? `You've joined ${joinedName}. Nothing is shared automatically — your accounts stay private until you choose to share them.`
            : `You're already a member of ${joinedName}.`}
        </p>
        <div className="invite-actions">
          <Link to="/household" className="auth-submit">
            Go to household
          </Link>
          <p className="invite-secondary-action">
            <Link to="/dashboard" className="auth-footer__link">
              Back to dashboard
            </Link>
          </p>
        </div>
      </>,
    );
  }

  // --- Terminal error states (from an accept attempt or derived from the row) -
  const terminalView: TerminalView | null =
    result && result.status === 'NOT_FOUND'
      ? 'not_found'
      : result && result.status === 'REVOKED'
        ? 'revoked'
        : result && result.status === 'EXPIRED'
          ? 'expired'
          : result && result.status === 'ALREADY_ACCEPTED'
            ? 'already_accepted'
            : !invitation
              ? 'not_found'
              : invitation.status === 'REVOKED' || invitation.deletedAt
                ? 'revoked'
                : invitation.status === 'EXPIRED' ||
                    new Date(invitation.expiresAt).getTime() < Date.now()
                  ? 'expired'
                  : invitation.status === 'ACCEPTED'
                    ? 'already_accepted'
                    : null;

  if (terminalView) {
    const { title, body } = TERMINAL_MESSAGES[terminalView];
    return renderCard(
      title,
      <>
        <p className="auth-brand__tagline" role="alert">
          {body}
        </p>
        <div className="invite-actions">
          <Link to="/household" className="auth-submit">
            Go to household
          </Link>
          <p className="invite-secondary-action">
            <Link to="/dashboard" className="auth-footer__link">
              Back to dashboard
            </Link>
          </p>
        </div>
      </>,
    );
  }

  // --- Pending & valid: show the invitation and let the invitee accept -------
  return renderCard(
    'Join a household',
    <>
      <p className="auth-brand__tagline">
        You&apos;ve been invited to join {householdName ?? 'a shared household'}. Joining shares
        nothing automatically — your accounts stay private until you choose to share them.
      </p>
      <dl className="invite-details">
        {householdName && (
          <div className="invite-details__row">
            <dt className="invite-details__label">Household</dt>
            <dd className="invite-details__value">{householdName}</dd>
          </div>
        )}
        <div className="invite-details__row">
          <dt className="invite-details__label">Your role</dt>
          <dd className="invite-details__value">
            {invitation ? ROLE_LABELS[invitation.role] : '—'}
          </dd>
        </div>
        {invitation?.email && (
          <div className="invite-details__row">
            <dt className="invite-details__label">Invited email</dt>
            <dd className="invite-details__value">{invitation.email}</dd>
          </div>
        )}
      </dl>
      {result?.status === 'ERROR' && (
        <p className="auth-error" role="alert">
          {result.message}
        </p>
      )}
      <div className="invite-actions">
        <button type="button" className="auth-submit" onClick={handleAccept}>
          Accept invitation
        </button>
        <p className="invite-secondary-action">
          <Link to="/dashboard" className="auth-footer__link">
            Not now
          </Link>
        </p>
      </div>
    </>,
  );
};

export default AcceptInvitePage;
