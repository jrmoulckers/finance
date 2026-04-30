// SPDX-License-Identifier: BUSL-1.1

/**
 * Referral Program page.
 *
 * Provides referral link generation, share modal,
 * referral status tracking, and reward display.
 *
 * References: issue #342
 */

import { useCallback, useState } from 'react';

import { useReferral } from '../hooks/useReferral';
import type { ReferralStatus } from '../hooks/useReferral';

import './ReferralPage.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: 'Pending',
  signed_up: 'Signed Up',
  activated: 'Activated',
  rewarded: 'Rewarded',
};

const STATUS_ICONS: Record<ReferralStatus, string> = {
  pending: '⏳',
  signed_up: '✉️',
  activated: '✅',
  rewarded: '🎁',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReferralPage() {
  const {
    referralCode,
    referralUrl,
    referrals,
    rewards,
    loading,
    error,
    copyReferralLink,
    shareReferral,
  } = useReferral();

  const [copied, setCopied] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const handleCopy = useCallback(async () => {
    const success = await copyReferralLink();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [copyReferralLink]);

  const handleShare = useCallback(async () => {
    await shareReferral();
    setShareModalOpen(false);
  }, [shareReferral]);

  const formatCents = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="referral-page" role="status" aria-live="polite" aria-label="Loading">
        <p className="referral-page__loading">Loading referral data…</p>
      </div>
    );
  }

  return (
    <main className="referral-page" aria-labelledby="referral-title">
      {error && (
        <div className="referral-banner--error" role="alert">
          {error}
        </div>
      )}

      {/* Header */}
      <header className="referral-header">
        <h1 id="referral-title" className="referral-header__title">
          Referral Program
        </h1>
        <p className="referral-header__subtitle">Invite friends and earn rewards when they join!</p>
      </header>

      {/* Rewards Summary */}
      <section className="referral-card referral-rewards" aria-labelledby="rewards-title">
        <h2 id="rewards-title" className="referral-card__title">
          Your Rewards
        </h2>
        <div className="referral-rewards__grid" role="list" aria-label="Reward statistics">
          <div className="referral-rewards__stat" role="listitem">
            <span className="referral-rewards__value" aria-label="Total earned">
              {formatCents(rewards.totalEarnedCents)}
            </span>
            <span className="referral-rewards__label">Total Earned</span>
          </div>
          <div className="referral-rewards__stat" role="listitem">
            <span className="referral-rewards__value" aria-label="Pending rewards">
              {formatCents(rewards.pendingCents)}
            </span>
            <span className="referral-rewards__label">Pending</span>
          </div>
          <div className="referral-rewards__stat" role="listitem">
            <span className="referral-rewards__value" aria-label="Total referrals">
              {rewards.referralCount}
            </span>
            <span className="referral-rewards__label">Referrals</span>
          </div>
          <div className="referral-rewards__stat" role="listitem">
            <span className="referral-rewards__value" aria-label="Activated referrals">
              {rewards.activatedCount}
            </span>
            <span className="referral-rewards__label">Activated</span>
          </div>
        </div>
      </section>

      {/* Referral Link */}
      <section className="referral-card" aria-labelledby="share-title">
        <h2 id="share-title" className="referral-card__title">
          Your Referral Link
        </h2>
        <div className="referral-link-box">
          <code className="referral-link-box__url" aria-label="Referral URL">
            {referralUrl}
          </code>
          <div className="referral-link-box__actions">
            <button
              className="referral-button referral-button--secondary"
              onClick={handleCopy}
              aria-label={copied ? 'Link copied!' : 'Copy referral link'}
            >
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
            <button
              className="referral-button referral-button--primary"
              onClick={() => setShareModalOpen(true)}
              aria-label="Share referral link"
            >
              Share
            </button>
          </div>
        </div>
        <p className="referral-link-box__code">
          Your code: <strong>{referralCode}</strong>
        </p>
      </section>

      {/* Referral History */}
      <section className="referral-card" aria-labelledby="history-title">
        <h2 id="history-title" className="referral-card__title">
          Referral History
        </h2>
        {referrals.length === 0 ? (
          <p className="referral-card__empty">No referrals yet. Share your link to get started!</p>
        ) : (
          <ul className="referral-list" role="list" aria-label="Referral history">
            {referrals.map((referral) => (
              <li key={referral.id} className="referral-list__item">
                <span className="referral-list__icon" aria-hidden="true">
                  {STATUS_ICONS[referral.status]}
                </span>
                <div className="referral-list__info">
                  <span className="referral-list__email">{referral.referredEmail}</span>
                  <span className="referral-list__date">
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span className={`referral-list__status referral-list__status--${referral.status}`}>
                  {STATUS_LABELS[referral.status]}
                </span>
                {referral.status === 'rewarded' && (
                  <span className="referral-list__reward" aria-label="Reward amount">
                    +{formatCents(referral.rewardAmountCents)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How It Works */}
      <section className="referral-card" aria-labelledby="how-it-works-title">
        <h2 id="how-it-works-title" className="referral-card__title">
          How It Works
        </h2>
        <ol className="referral-steps" aria-label="Referral program steps">
          <li className="referral-steps__item">
            <span className="referral-steps__number" aria-hidden="true">
              1
            </span>
            <div>
              <strong>Share your link</strong>
              <p>Send your unique referral link to friends and family.</p>
            </div>
          </li>
          <li className="referral-steps__item">
            <span className="referral-steps__number" aria-hidden="true">
              2
            </span>
            <div>
              <strong>They sign up</strong>
              <p>Your friend creates an account using your referral link.</p>
            </div>
          </li>
          <li className="referral-steps__item">
            <span className="referral-steps__number" aria-hidden="true">
              3
            </span>
            <div>
              <strong>Both earn rewards</strong>
              <p>You both get $5.00 credit when they activate their account.</p>
            </div>
          </li>
        </ol>
      </section>

      {/* Share Modal */}
      {shareModalOpen && (
        <div className="referral-modal" role="presentation">
          <div
            className="referral-modal__backdrop"
            aria-hidden="true"
            onClick={() => setShareModalOpen(false)}
          />
          <div
            className="referral-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
          >
            <h2 id="share-modal-title" className="referral-modal__title">
              Share Your Referral
            </h2>
            <p className="referral-modal__text">
              Share your referral code <strong>{referralCode}</strong> with friends!
            </p>
            <div className="referral-modal__actions">
              <button
                className="referral-button referral-button--secondary"
                onClick={() => setShareModalOpen(false)}
              >
                Cancel
              </button>
              <button className="referral-button referral-button--primary" onClick={handleShare}>
                Share Now
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default ReferralPage;
