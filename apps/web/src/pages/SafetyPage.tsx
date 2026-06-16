// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useTransactions } from '../hooks';
import { detectScamAlerts } from '../lib/notifications';
import type { ScamSpendingAlert } from '../lib/notifications';
import './SafetyPage.css';

const SAFETY_TIPS = [
  'Never share your password, card PIN, or one-time sign-in code with anyone.',
  'Your bank will not call and ask you to read a security code over the phone.',
  'Pause before sending money to someone who says it is urgent or secret.',
  'Use the phone number on your card or bank statement if you need to check a message.',
  'Be careful with links in texts or emails. Type the bank website yourself when you can.',
] as const;

function reviewHref(alert: ScamSpendingAlert): string {
  return alert.transactionIds.length === 1
    ? `/transactions/${alert.transactionIds[0]}`
    : '/transactions';
}

export const SafetyPage: React.FC = () => {
  const scamAlertFilters = useMemo(
    () => ({
      type: 'EXPENSE' as const,
    }),
    [],
  );
  const { transactions, loading, error, refresh } = useTransactions(scamAlertFilters);
  const scamAlerts = useMemo(() => detectScamAlerts(transactions), [transactions]);
  const hasAlerts = scamAlerts.length > 0;

  return (
    <main className="safety-page" aria-labelledby="safety-page-title">
      <header className="safety-page__header">
        <p className="safety-page__eyebrow">Plain-English account safety</p>
        <h1 id="safety-page-title" className="safety-page__title">
          Safety
        </h1>
        <p className="safety-page__intro">
          A simple place to check for unusual spending and remember common scam warning signs.
        </p>
      </header>

      <section
        className={`safety-page__status safety-page__status--${hasAlerts ? 'check' : 'clear'}`}
        aria-labelledby="safety-status-title"
        aria-live="polite"
      >
        <div>
          <p className="safety-page__status-label">Safety status</p>
          <h2 id="safety-status-title" className="safety-page__status-title">
            {loading
              ? 'Checking recent activity'
              : hasAlerts
                ? 'A few things may need a quick look'
                : 'Everything looks normal'}
          </h2>
          <p className="safety-page__status-text">
            {hasAlerts
              ? 'These are not proof of fraud. They are simply items worth checking calmly.'
              : 'We did not find scam-like or unusual spending patterns in your recent transactions.'}
          </p>
        </div>
        <button type="button" className="safety-page__check-button" onClick={refresh}>
          Check again
        </button>
      </section>

      {error ? (
        <div className="safety-page__error" role="alert">
          We could not check your recent transactions right now. {error}
        </div>
      ) : null}

      <section className="safety-page__section" aria-labelledby="things-to-check-title">
        <div className="safety-page__section-header">
          <h2 id="things-to-check-title" className="safety-page__section-title">
            Things to check
          </h2>
          <p className="safety-page__section-note">
            Review only what looks unfamiliar. If you recognize it, no action is needed.
          </p>
        </div>

        {loading ? (
          <p className="safety-page__empty" role="status">
            Checking your recent transactions…
          </p>
        ) : hasAlerts ? (
          <ol className="safety-page__alert-list" aria-label="Things to check">
            {scamAlerts.map((alert) => (
              <li key={alert.id} className="safety-page__alert-card">
                <div className="safety-page__alert-content">
                  <h3 className="safety-page__alert-title">{alert.title}</h3>
                  <p className="safety-page__alert-message">{alert.message}</p>
                  <p className="safety-page__next-step">
                    <strong>Next step:</strong> {alert.nextStep}
                  </p>
                </div>
                <Link className="safety-page__review-link" to={reviewHref(alert)}>
                  Review details
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="safety-page__empty">
            Everything looks normal. There is nothing you need to check right now.
          </p>
        )}
      </section>

      <section className="safety-page__section" aria-labelledby="safety-tips-title">
        <div className="safety-page__section-header">
          <h2 id="safety-tips-title" className="safety-page__section-title">
            Simple safety tips
          </h2>
          <p className="safety-page__section-note">
            A quick reminder list for phone calls, texts, and emails.
          </p>
        </div>
        <ul className="safety-page__tip-list">
          {SAFETY_TIPS.map((tip) => (
            <li key={tip} className="safety-page__tip-card">
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

export default SafetyPage;
