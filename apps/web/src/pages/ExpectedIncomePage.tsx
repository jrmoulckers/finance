// SPDX-License-Identifier: BUSL-1.1

/**
 * ExpectedIncomePage — track expected income separately from cleared cash.
 *
 * Built for a household that receives money which is sometimes late (e.g.
 * child support). The page keeps a hard line between:
 *   - **Spendable now** — money that has actually cleared, and
 *   - **Expected** — money that is only hoped for and must not be spent yet.
 *
 * It also surfaces a confidence-weighted view and flags overdue payments so
 * bills can be planned realistically. All money is integer cents; the
 * aggregation is delegated to the pure engine in `lib/income`.
 *
 * Refs #2193
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

import { EmptyState, Icon } from '../components/common';
import { IconToken } from '../icons/tokens';
import { formatCurrency } from '../lib/currency';
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  EXPECTED_INCOME_CHANGED_EVENT,
  createExpectedIncomeItem,
  deleteExpectedIncomeItem,
  isOverdue,
  loadExpectedIncomeItems,
  setExpectedIncomeCleared,
  sortExpectedIncome,
  summarizeExpectedIncome,
  type ConfidenceLevel,
  type ExpectedIncomeItem,
} from '../lib/income';

import './ExpectedIncomePage.css';

/** Local-date "today" as an ISO `YYYY-MM-DD` string (avoids UTC drift). */
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Friendly date label, falling back to the raw ISO string. */
function formatExpectedDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface StatusDescriptor {
  label: string;
  icon: IconToken;
  className: string;
}

function describeStatus(item: ExpectedIncomeItem, referenceDate: string): StatusDescriptor {
  if (item.cleared) {
    return { label: 'Received', icon: IconToken.SUCCESS, className: 'is-cleared' };
  }
  if (isOverdue(item, referenceDate)) {
    return { label: 'Overdue', icon: IconToken.WARNING, className: 'is-overdue' };
  }
  return { label: 'Expected', icon: IconToken.PENDING, className: 'is-pending' };
}

export function ExpectedIncomePage() {
  const [items, setItems] = useState<ExpectedIncomeItem[]>(() => loadExpectedIncomeItems());
  const [referenceDate] = useState<string>(() => todayIso());

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedDate, setExpectedDate] = useState(referenceDate);
  const [confidence, setConfidence] = useState<ConfidenceLevel>('medium');
  const [cleared, setCleared] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const refresh = () => setItems(loadExpectedIncomeItems());
    refresh();
    window.addEventListener(EXPECTED_INCOME_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(EXPECTED_INCOME_CHANGED_EVENT, refresh);
  }, []);

  const summary = useMemo(
    () => summarizeExpectedIncome(items, referenceDate),
    [items, referenceDate],
  );
  const sortedItems = useMemo(
    () => sortExpectedIncome(items, referenceDate),
    [items, referenceDate],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedLabel = label.trim();
      if (!trimmedLabel) {
        setFormError('Enter a name for this expected payment.');
        return;
      }

      const dollars = Number.parseFloat(amount);
      if (!Number.isFinite(dollars) || dollars < 0) {
        setFormError('Enter an amount of 0 or more.');
        return;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDate)) {
        setFormError('Choose the date you expect the money.');
        return;
      }

      try {
        createExpectedIncomeItem({
          label: trimmedLabel,
          amountCents: Math.round(dollars * 100),
          expectedDate,
          confidence,
          cleared,
        });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Could not save this item.');
        return;
      }

      setFormError(null);
      setStatusMessage(
        `Added “${trimmedLabel}” as ${cleared ? 'received' : 'expected'} income of ${formatCurrency(
          Math.round(dollars * 100),
        )}.`,
      );
      setLabel('');
      setAmount('');
      setExpectedDate(referenceDate);
      setConfidence('medium');
      setCleared(false);
    },
    [amount, cleared, confidence, expectedDate, label, referenceDate],
  );

  const handleToggleCleared = useCallback((item: ExpectedIncomeItem) => {
    const next = !item.cleared;
    setExpectedIncomeCleared(item.id, next);
    setStatusMessage(
      `Marked “${item.label}” as ${next ? 'received (now spendable)' : 'still expected'}.`,
    );
  }, []);

  const handleDelete = useCallback((item: ExpectedIncomeItem) => {
    deleteExpectedIncomeItem(item.id);
    setStatusMessage(`Removed “${item.label}”.`);
  }, []);

  return (
    <main className="expected-income" aria-labelledby="expected-income-title">
      <header className="expected-income__header">
        <p className="expected-income__eyebrow">Income planning</p>
        <h1 id="expected-income-title" className="expected-income__title">
          Expected vs. Cleared Income
        </h1>
        <p className="expected-income__description">
          Track money you are <em>expecting</em> separately from money that has actually arrived.
          Only cleared payments count as spendable now — expected money is shown on its own so you
          can plan bills without pretending late money has landed.
        </p>
      </header>

      {/* Live region for confirmations / status updates. */}
      <p className="expected-income__live" role="status" aria-live="polite">
        {statusMessage}
      </p>

      <section
        className="expected-income__form-section"
        aria-labelledby="expected-income-form-title"
      >
        <h2 id="expected-income-form-title" className="expected-income__section-title">
          Add an expected payment
        </h2>
        <form className="expected-income__form" onSubmit={handleSubmit} noValidate>
          <div className="expected-income__field">
            <label className="expected-income__label" htmlFor="expected-income-label">
              Name
            </label>
            <input
              id="expected-income-label"
              className="expected-income__input"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Child support — June"
              autoComplete="off"
              required
            />
          </div>

          <div className="expected-income__field">
            <label className="expected-income__label" htmlFor="expected-income-amount">
              Amount
            </label>
            <input
              id="expected-income-amount"
              className="expected-income__input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="expected-income__field">
            <label className="expected-income__label" htmlFor="expected-income-date">
              Expected date
            </label>
            <input
              id="expected-income-date"
              className="expected-income__input"
              type="date"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
              required
            />
          </div>

          <div className="expected-income__field">
            <label className="expected-income__label" htmlFor="expected-income-confidence">
              Confidence
            </label>
            <select
              id="expected-income-confidence"
              className="expected-income__input"
              value={confidence}
              onChange={(event) => setConfidence(event.target.value as ConfidenceLevel)}
              aria-describedby="expected-income-confidence-hint"
            >
              {CONFIDENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {CONFIDENCE_LABELS[level]}
                </option>
              ))}
            </select>
            <span id="expected-income-confidence-hint" className="expected-income__hint">
              How sure are you this payment will arrive? Lower confidence discounts it in the
              conservative plan.
            </span>
          </div>

          <div className="expected-income__field expected-income__field--checkbox">
            <input
              id="expected-income-cleared"
              className="expected-income__checkbox"
              type="checkbox"
              checked={cleared}
              onChange={(event) => setCleared(event.target.checked)}
            />
            <label className="expected-income__checkbox-label" htmlFor="expected-income-cleared">
              Already received (counts as spendable now)
            </label>
          </div>

          {formError ? (
            <p className="expected-income__error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="expected-income__form-actions">
            <button
              type="submit"
              className="expected-income__button expected-income__button--primary"
            >
              Add payment
            </button>
          </div>
        </form>
      </section>

      <section className="expected-income__summary" aria-labelledby="expected-income-summary-title">
        <h2 id="expected-income-summary-title" className="expected-income__section-title">
          Where your money stands
        </h2>
        <div className="expected-income__summary-grid">
          <div className="expected-income__card expected-income__card--realized">
            <h3 className="expected-income__card-title">Spendable now</h3>
            <p className="expected-income__card-value">{formatCurrency(summary.realizedCents)}</p>
            <p className="expected-income__card-note">
              Cleared payments only — money you actually have.
            </p>
          </div>

          <div className="expected-income__card expected-income__card--expected">
            <h3 className="expected-income__card-title">Expected (not yet received)</h3>
            <p className="expected-income__card-value">
              {formatCurrency(summary.expectedNotYetReceivedCents)}
            </p>
            <p className="expected-income__card-note">
              Hoped-for money. Not spendable until it clears.
            </p>
          </div>

          <div className="expected-income__card">
            <h3 className="expected-income__card-title">Conservative expected</h3>
            <p className="expected-income__card-value">
              {formatCurrency(summary.confidenceWeightedExpectedCents)}
            </p>
            <p className="expected-income__card-note">Expected money discounted by confidence.</p>
          </div>

          <div
            className={`expected-income__card${
              summary.overdueCount > 0 ? ' expected-income__card--overdue' : ''
            }`}
          >
            <h3 className="expected-income__card-title">
              <Icon name={IconToken.WARNING} size={18} className="expected-income__card-icon" />
              Overdue
            </h3>
            <p className="expected-income__card-value">
              {summary.overdueCount} {summary.overdueCount === 1 ? 'payment' : 'payments'}
            </p>
            <p className="expected-income__card-note">
              {formatCurrency(summary.overdueCents)} past its expected date, still uncleared.
            </p>
          </div>

          <div className="expected-income__card expected-income__card--planned">
            <h3 className="expected-income__card-title">Planned incl. expected</h3>
            <p className="expected-income__card-value">
              {formatCurrency(summary.plannedTotalCents)}
            </p>
            <p className="expected-income__card-note">
              Spendable now plus all expected money. Treat the uncertain part with care.
            </p>
          </div>

          <div className="expected-income__card expected-income__card--planned">
            <h3 className="expected-income__card-title">Conservative plan</h3>
            <p className="expected-income__card-value">
              {formatCurrency(summary.plannedConfidenceAdjustedCents)}
            </p>
            <p className="expected-income__card-note">
              Spendable now plus confidence-weighted expected money.
            </p>
          </div>
        </div>
      </section>

      <section
        className="expected-income__list-section"
        aria-labelledby="expected-income-list-title"
      >
        <h2 id="expected-income-list-title" className="expected-income__section-title">
          Payments ({summary.totalCount})
        </h2>

        {sortedItems.length === 0 ? (
          <EmptyState
            title="No expected income yet"
            description="Add a payment above to start separating money you have from money you are still waiting on."
          />
        ) : (
          <ul className="expected-income__list">
            {sortedItems.map((item) => {
              const status = describeStatus(item, referenceDate);
              return (
                <li key={item.id} className={`expected-income__item ${status.className}`}>
                  <div className="expected-income__item-main">
                    <h3 className="expected-income__item-title">{item.label}</h3>
                    <p className="expected-income__item-meta">
                      <span className="expected-income__item-amount">
                        {formatCurrency(item.amountCents)}
                      </span>
                      {' · '}
                      <time dateTime={item.expectedDate}>
                        {formatExpectedDate(item.expectedDate)}
                      </time>
                      {' · '}
                      <span className="expected-income__item-confidence">
                        {CONFIDENCE_LABELS[item.confidence]} confidence
                      </span>
                    </p>
                  </div>

                  <span className={`expected-income__status ${status.className}`}>
                    <Icon name={status.icon} size={18} className="expected-income__status-icon" />
                    <span className="expected-income__status-text">{status.label}</span>
                  </span>

                  <div className="expected-income__item-actions">
                    <button
                      type="button"
                      className="expected-income__button"
                      onClick={() => handleToggleCleared(item)}
                    >
                      {item.cleared ? 'Mark not received' : 'Mark received'}
                    </button>
                    <button
                      type="button"
                      className="expected-income__button expected-income__button--danger"
                      onClick={() => handleDelete(item)}
                      aria-label={`Delete ${item.label}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

export default ExpectedIncomePage;
