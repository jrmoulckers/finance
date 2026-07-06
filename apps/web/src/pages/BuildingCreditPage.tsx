// SPDX-License-Identifier: BUSL-1.1

/**
 * BuildingCreditPage - beginner credit education plus a secured-card
 * utilization tracker for someone building credit from zero.
 *
 * Two parts, both fully on-device:
 *   1. Plain-language lessons: what a credit score is, why utilization
 *      matters, on-time payments and how secured cards build credit.
 *   2. A secured-card utilization tracker: enter your balance and limit to
 *      see your utilization, a friendly classification (good / caution /
 *      high) and guidance toward a low target.
 *
 * All money is integer cents via the pure helper in
 * `lib/credit/secured-card-utilization`. Status is conveyed by text plus
 * icon, never colour alone, and the meter respects reduced motion.
 *
 * References: issue #2174
 */

import { useEffect, useMemo, useState } from 'react';

import { Icon } from '../components/common';
import { IconToken } from '../icons/tokens';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { formatCurrency } from '../lib/currency';
import {
  CREDIT_BUILDING_LESSONS,
  CREDIT_BUILDING_TIPS,
} from '../lib/credit/credit-building-education';
import {
  computeSecuredCardUtilization,
  formatUtilizationPercent,
  type SecuredCardUtilizationLevel,
} from '../lib/credit/secured-card-utilization';

import './BuildingCreditPage.css';

const PAGE_DESCRIPTION =
  'New to credit? Start here. Learn how credit works in plain language, then use the secured card tracker to keep your utilization low. Everything stays on your device.';

const TRACKER_INTRO =
  'Enter your card balance and credit limit to see how much of your limit you are using. Keeping this low helps your credit grow.';

const NO_LIMIT_DETAIL = 'Utilization is not available until you add a credit limit.';

const TARGET_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 30, label: '30% (lender comfort zone)' },
  { value: 20, label: '20% (stronger)' },
  { value: 10, label: '10% (best)' },
];

const LEVEL_ICON: Record<SecuredCardUtilizationLevel, IconToken> = {
  good: IconToken.SUCCESS,
  caution: IconToken.WARNING,
  high: IconToken.WARNING,
  unknown: IconToken.INFO,
};

/** Parse a user-entered dollar string into integer cents (>= 0). */
function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

export function BuildingCreditPage() {
  const reducedMotion = useReducedMotion();

  const [balanceInput, setBalanceInput] = useState('');
  const [limitInput, setLimitInput] = useState('');
  const [targetPercent, setTargetPercent] = useState(30);

  const utilization = useMemo(
    () =>
      computeSecuredCardUtilization({
        balanceCents: dollarsToCents(balanceInput),
        creditLimitCents: dollarsToCents(limitInput),
        targetUtilizationPercent: targetPercent,
      }),
    [balanceInput, limitInput, targetPercent],
  );

  const hasLimit = utilization.utilizationPercent !== null;
  const meterPercent =
    utilization.utilizationPercent === null
      ? 0
      : Math.min(100, Math.max(0, utilization.utilizationPercent));

  const statusIcon = LEVEL_ICON[utilization.level];
  const resultClassName = `building-credit__result building-credit__result--${utilization.level}`;
  const meterClassName = reducedMotion
    ? 'building-credit__meter building-credit__meter--static'
    : 'building-credit__meter';
  const meterFillClassName = `building-credit__meter-fill building-credit__meter-fill--${utilization.level}`;
  const utilizationLabel = formatUtilizationPercent(utilization.utilizationPercent);
  const meterValueText = `${utilizationLabel} of credit limit used`;
  const usageDetail = hasLimit
    ? `${formatCurrency(utilization.balanceCents)} of ${formatCurrency(utilization.creditLimitCents)} used`
    : NO_LIMIT_DETAIL;
  const showPayDown = hasLimit && utilization.payDownToTargetCents > 0;

  // Announce a concise, debounced summary instead of re-reading the whole
  // result block on every keystroke (#3413, WCAG 2.2 4.1.3 Status Messages).
  const [announcedSummary, setAnnouncedSummary] = useState('');
  useEffect(() => {
    const summary = hasLimit ? `${meterValueText}. ${utilization.levelLabel}.` : '';
    const timeout = window.setTimeout(() => setAnnouncedSummary(summary), 600);
    return () => window.clearTimeout(timeout);
  }, [hasLimit, meterValueText, utilization.levelLabel]);

  return (
    <div className="building-credit">
      <header className="building-credit__header">
        <p className="building-credit__eyebrow">Building credit from zero</p>
        <h2 id="building-credit-title" className="building-credit__title">
          Building credit
        </h2>
        <p className="building-credit__description">{PAGE_DESCRIPTION}</p>
      </header>

      <section className="building-credit__card" aria-labelledby="building-credit-tracker-title">
        <h2 id="building-credit-tracker-title" className="building-credit__card-title">
          Secured card utilization tracker
        </h2>
        <p className="building-credit__card-intro">{TRACKER_INTRO}</p>

        <div className="building-credit__fields">
          <div className="building-credit__field">
            <label className="building-credit__label" htmlFor="building-credit-balance">
              Current balance
            </label>
            <div className="building-credit__money-input">
              <span className="building-credit__money-prefix" aria-hidden="true">
                $
              </span>
              <input
                id="building-credit-balance"
                className="building-credit__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="150.00"
                value={balanceInput}
                onChange={(changeEvent) => setBalanceInput(changeEvent.target.value)}
              />
            </div>
          </div>

          <div className="building-credit__field">
            <label className="building-credit__label" htmlFor="building-credit-limit">
              Credit limit
            </label>
            <div className="building-credit__money-input">
              <span className="building-credit__money-prefix" aria-hidden="true">
                $
              </span>
              <input
                id="building-credit-limit"
                className="building-credit__input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="500.00"
                value={limitInput}
                onChange={(changeEvent) => setLimitInput(changeEvent.target.value)}
              />
            </div>
          </div>

          <div className="building-credit__field">
            <label className="building-credit__label" htmlFor="building-credit-target">
              Target utilization
            </label>
            <select
              id="building-credit-target"
              className="building-credit__input"
              value={targetPercent}
              onChange={(changeEvent) => setTargetPercent(Number(changeEvent.target.value))}
            >
              {TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={resultClassName}>
          <p className="sr-only" role="status">
            {announcedSummary}
          </p>
          <div className="building-credit__result-heading">
            <Icon name={statusIcon} className="building-credit__result-icon" aria-hidden="true" />
            <p className="building-credit__result-headline">{utilization.headline}</p>
            <span className="building-credit__badge">{utilization.levelLabel}</span>
          </div>

          <p className="building-credit__utilization-figure">
            <span className="building-credit__utilization-percent">{utilizationLabel}</span>
            <span className="building-credit__utilization-detail">{usageDetail}</span>
          </p>

          {hasLimit && (
            <div
              className={meterClassName}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(meterPercent)}
              aria-valuetext={meterValueText}
              aria-label="Credit utilization"
            >
              <div className={meterFillClassName} style={{ width: `${meterPercent}%` }} />
            </div>
          )}

          <p className="building-credit__guidance">{utilization.guidance}</p>

          {showPayDown && (
            <dl className="building-credit__pay-down">
              <div className="building-credit__pay-down-row">
                <dt className="building-credit__pay-down-label">
                  Pay down to reach {utilization.targetUtilizationPercent}%
                </dt>
                <dd className="building-credit__pay-down-value">
                  {formatCurrency(utilization.payDownToTargetCents)}
                </dd>
              </div>
              {utilization.targetBalanceCents !== null && (
                <div className="building-credit__pay-down-row">
                  <dt className="building-credit__pay-down-label">Target balance</dt>
                  <dd className="building-credit__pay-down-value">
                    {formatCurrency(utilization.targetBalanceCents)} or less
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      <section className="building-credit__card" aria-labelledby="building-credit-lessons-title">
        <h2 id="building-credit-lessons-title" className="building-credit__card-title">
          Credit basics
        </h2>
        <ol className="building-credit__lessons">
          {CREDIT_BUILDING_LESSONS.map((lesson) => {
            const headingId = `lesson-${lesson.id}`;
            return (
              <li key={lesson.id} className="building-credit__lesson">
                <article className="building-credit__lesson-body" aria-labelledby={headingId}>
                  <h3 id={headingId} className="building-credit__lesson-title">
                    {lesson.title}
                  </h3>
                  <p className="building-credit__lesson-summary">{lesson.summary}</p>
                  <p className="building-credit__lesson-text">{lesson.body}</p>
                  <p className="building-credit__lesson-takeaway">
                    <Icon
                      name={IconToken.CHECK}
                      size={16}
                      className="building-credit__lesson-takeaway-icon"
                      aria-hidden="true"
                    />
                    {`Takeaway: ${lesson.takeaway}`}
                  </p>
                </article>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="building-credit__card" aria-labelledby="building-credit-tips-title">
        <h2 id="building-credit-tips-title" className="building-credit__card-title">
          Quick tips
        </h2>
        <ul className="building-credit__tips">
          {CREDIT_BUILDING_TIPS.map((tip) => (
            <li key={tip.id} className="building-credit__tip">
              <Icon
                name={IconToken.SUCCESS}
                size={16}
                className="building-credit__tip-icon"
                aria-hidden="true"
              />
              <span>{tip.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default BuildingCreditPage;
