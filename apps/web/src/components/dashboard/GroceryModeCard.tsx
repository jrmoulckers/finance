// SPDX-License-Identifier: BUSL-1.1

/**
 * Grocery mode card — a fast, supportive "can I afford this?" / "safe to spend
 * before payday" glance for the dashboard.
 *
 * Surfaces:
 *   - The amount that's safe to spend before the next payday.
 *   - A pinned high-frequency category (e.g. Groceries) and its remaining budget.
 *   - The critical bills due before payday, for context.
 *   - A quick "can I afford $___ right now?" check.
 *
 * Accessibility:
 *   - The computed answers live in `aria-live="polite"` regions so screen
 *     reader users hear updates as they change the pinned category or type an
 *     amount.
 *   - Tone is conveyed by an icon **and** supportive text — never by colour
 *     alone (WCAG 2.2 AA, 1.4.1 Use of Color).
 *   - Controls are native, labelled and keyboard-navigable.
 *   - Copy is gentle and non-alarming, even when money is tight.
 *
 * All calculation lives in the pure `lib/dashboard/grocery-mode` engine; this
 * component only formats and presents the result.
 *
 * References: issue #2199
 */

import React, { useCallback, useId, useMemo, useState } from 'react';

import { CurrencyDisplay } from '../common';
import { AppIcon, type IconName } from '../icons';
import { useIsPrivacyModeActive } from '../../contexts/PrivacyModeContext';
import { formatCurrency } from '../../lib/currency';
import {
  computeSafeToSpend,
  estimateNextPayday,
  evaluateAffordability,
  parseAmountToCents,
  type PinnedCategoryInput,
  type UpcomingBillInput,
} from '../../lib/dashboard/grocery-mode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A category the user can pin to track, with its current-period budget. */
export interface GroceryCategoryOption {
  readonly id: string;
  readonly name: string;
  readonly budgetCents: number;
  readonly spentCents: number;
}

export interface GroceryModeCardProps {
  /** Current spendable balance (signed) in integer cents. */
  readonly availableFundsCents: number;
  /** Amount already earmarked (e.g. savings goals) in integer cents. */
  readonly reservedCents?: number;
  /** Bills to consider; the engine filters by status, date and criticality. */
  readonly bills: readonly UpcomingBillInput[];
  /** Categories the user can pin to track (typically active monthly budgets). */
  readonly categoryOptions: readonly GroceryCategoryOption[];
  /** Today's date as an ISO `YYYY-MM-DD` string. */
  readonly today: string;
  /**
   * Recent income transaction dates (ISO `YYYY-MM-DD`), used to estimate the
   * next payday. When empty or inconclusive, {@link fallbackPayday} is used.
   */
  readonly incomeDates?: readonly string[];
  /**
   * The payday to assume when income history can't produce one (e.g. end of the
   * current month), as `YYYY-MM-DD`, or `null` when none is known.
   */
  readonly fallbackPayday?: string | null;
  /** ISO 4217 currency code (default: `"USD"`). */
  readonly currency?: string;
  /** Category id to pin initially, when known. */
  readonly defaultPinnedCategoryId?: string | null;
}

const NONE_VALUE = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPaydayLabel(nextPayday: string | null): string {
  if (!nextPayday) return 'your next paycheck';
  const ms = Date.parse(`${nextPayday.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 'your next paycheck';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

function formatDueLabel(dueDate: string): string {
  const ms = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return dueDate;
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GroceryModeCard: React.FC<GroceryModeCardProps> = ({
  availableFundsCents,
  reservedCents = 0,
  bills,
  categoryOptions,
  today,
  incomeDates,
  fallbackPayday = null,
  currency = 'USD',
  defaultPinnedCategoryId = null,
}) => {
  const fieldPrefix = useId();
  const isPrivacyMode = useIsPrivacyModeActive();

  const [pinnedCategoryId, setPinnedCategoryId] = useState<string>(
    defaultPinnedCategoryId ?? NONE_VALUE,
  );
  const [affordRaw, setAffordRaw] = useState<string>('');

  const nextPayday = useMemo(
    () => estimateNextPayday(incomeDates ?? [], today) ?? fallbackPayday,
    [incomeDates, today, fallbackPayday],
  );

  const pinnedCategory = useMemo<PinnedCategoryInput | null>(() => {
    const match = categoryOptions.find((option) => option.id === pinnedCategoryId);
    if (!match) return null;
    return {
      categoryId: match.id,
      name: match.name,
      budgetCents: match.budgetCents,
      spentCents: match.spentCents,
    };
  }, [categoryOptions, pinnedCategoryId]);

  const result = useMemo(
    () =>
      computeSafeToSpend({
        availableFundsCents,
        reservedCents,
        bills,
        today,
        nextPayday,
        pinnedCategory,
      }),
    [availableFundsCents, reservedCents, bills, today, nextPayday, pinnedCategory],
  );

  const affordCents = parseAmountToCents(affordRaw);
  const affordability =
    affordCents === null ? null : evaluateAffordability(result.safeToSpendCents, affordCents);

  const handleCategoryChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setPinnedCategoryId(event.target.value);
  }, []);

  const handleAffordChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAffordRaw(event.target.value);
  }, []);

  const money = useCallback(
    (cents: number): string =>
      isPrivacyMode ? 'a hidden amount' : formatCurrency(cents, { currency }),
    [currency, isPrivacyMode],
  );

  const paydayLabel = formatPaydayLabel(nextPayday);
  const beforePaydayClause = result.hasPayday ? ` before ${paydayLabel}` : ' right now';
  const isTight = result.safeToSpendCents < 0;
  const isExactlyCovered = result.safeToSpendCents === 0;

  const toneIcon: IconName = isTight ? 'info' : 'check-circle';
  const tone = isTight ? 'tight' : 'calm';
  const displaySafeToSpend = Math.max(0, result.safeToSpendCents);

  let answerSentence: string;
  if (isTight) {
    answerSentence =
      `Money's a little tight right now. After ${money(result.upcomingCriticalBillsCents)} of bills ` +
      `due${beforePaydayClause}, you're about ${money(Math.abs(result.safeToSpendCents))} short. ` +
      `It may help to hold off on extras until ${paydayLabel}.`;
  } else if (isExactlyCovered) {
    answerSentence =
      `You're right on track. Your money is fully set aside for bills` +
      `${beforePaydayClause}. There's nothing extra to spend just yet.`;
  } else if (result.upcomingCriticalBillsCents > 0) {
    answerSentence =
      `You have ${money(result.safeToSpendCents)} to spend${beforePaydayClause}, ` +
      `after setting aside ${money(result.upcomingCriticalBillsCents)} for bills due first.`;
  } else {
    answerSentence = `You have ${money(result.safeToSpendCents)} to spend${beforePaydayClause}. No critical bills are due first.`;
  }

  const dailySentence =
    result.dailyAllowanceCents !== null && result.daysUntilPayday !== null
      ? `That's about ${money(result.dailyAllowanceCents)} a day for the next ${result.daysUntilPayday} ${result.daysUntilPayday === 1 ? 'day' : 'days'}.`
      : null;

  const pinned = result.pinnedCategory;
  const pinnedSentence = pinned
    ? pinned.remainingCents > 0
      ? `You still have ${money(pinned.remainingCents)} left in your ${pinned.name} budget.`
      : `You've used up your ${pinned.name} budget for now. No stress, it resets next period.`
    : null;

  const categorySelectId = `${fieldPrefix}-category`;
  const affordInputId = `${fieldPrefix}-afford`;
  const affordResultId = `${fieldPrefix}-afford-result`;

  return (
    <article
      className={`card grocery-mode-card grocery-mode-card--${tone}`}
      aria-labelledby={`${fieldPrefix}-title`}
    >
      <header className="grocery-mode-card__header">
        <p className="grocery-mode-card__eyebrow">
          <AppIcon name="shopping-cart" className="grocery-mode-card__eyebrow-icon" />
          Grocery mode
        </p>
        <h3 id={`${fieldPrefix}-title`} className="grocery-mode-card__title">
          {result.hasPayday ? `Safe to spend before ${paydayLabel}` : 'Safe to spend right now'}
        </h3>
      </header>

      <p className="grocery-mode-card__amount" aria-hidden="true">
        <AppIcon name={toneIcon} className="grocery-mode-card__amount-icon" />
        <CurrencyDisplay amount={displaySafeToSpend} currency={currency} />
      </p>

      <div className="grocery-mode-card__answer" role="status" aria-live="polite">
        <p className="grocery-mode-card__answer-text">{answerSentence}</p>
        {dailySentence && <p className="grocery-mode-card__answer-meta">{dailySentence}</p>}
        {pinnedSentence && <p className="grocery-mode-card__answer-pinned">{pinnedSentence}</p>}
      </div>

      {result.upcomingBills.length > 0 ? (
        <div className="grocery-mode-card__bills">
          <p className="grocery-mode-card__bills-title">
            {result.hasPayday
              ? `Bills set aside before ${paydayLabel}`
              : 'Critical bills set aside'}
          </p>
          <ul className="grocery-mode-card__bills-list">
            {result.upcomingBills.map((bill) => (
              <li key={bill.id} className="grocery-mode-card__bill">
                <span className="grocery-mode-card__bill-name">{bill.name}</span>
                <span className="grocery-mode-card__bill-due">{formatDueLabel(bill.dueDate)}</span>
                <span className="grocery-mode-card__bill-amount">
                  <CurrencyDisplay
                    amount={bill.amountCents}
                    currency={currency}
                    context={`${bill.name} bill due ${formatDueLabel(bill.dueDate)}`}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="grocery-mode-card__bills-empty">
          No critical bills are due{result.hasPayday ? ` before ${paydayLabel}` : ' soon'}. Nice and
          clear.
        </p>
      )}

      <div className="grocery-mode-card__controls">
        {categoryOptions.length > 0 && (
          <div className="grocery-mode-card__field">
            <label htmlFor={categorySelectId} className="grocery-mode-card__label">
              Track a category
            </label>
            <select
              id={categorySelectId}
              className="grocery-mode-card__select"
              value={pinnedCategoryId}
              onChange={handleCategoryChange}
            >
              <option value={NONE_VALUE}>None (just the overall answer)</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grocery-mode-card__field">
          <label htmlFor={affordInputId} className="grocery-mode-card__label">
            Can I afford…?
          </label>
          <div className="grocery-mode-card__afford-input">
            <span className="grocery-mode-card__afford-prefix" aria-hidden="true">
              $
            </span>
            <input
              id={affordInputId}
              className="grocery-mode-card__input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={affordRaw}
              onChange={handleAffordChange}
              aria-describedby={affordability ? affordResultId : undefined}
            />
          </div>
        </div>
      </div>

      <p
        id={affordResultId}
        className={`grocery-mode-card__afford-result grocery-mode-card__afford-result--${
          affordability?.affordable ? 'yes' : 'no'
        }`}
        role="status"
        aria-live="polite"
      >
        {affordability && (
          <>
            <AppIcon
              name={affordability.affordable ? 'check-circle' : 'info'}
              className="grocery-mode-card__afford-icon"
            />
            <span>
              {affordability.affordable
                ? `Yes, go for it. You'd still have ${money(affordability.remainingAfterCents)} free${beforePaydayClause}.`
                : `Not just yet. That's about ${money(affordability.shortfallCents)} more than you have free${beforePaydayClause}. Maybe wait until ${paydayLabel}.`}
            </span>
          </>
        )}
      </p>
    </article>
  );
};

export default GroceryModeCard;
