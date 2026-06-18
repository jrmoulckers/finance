// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useState } from 'react';
import { CurrencyDisplay } from '../common';
import { useIsPrivacyModeActive } from '../../contexts/PrivacyModeContext';
import type { SafeToSpendBreakdown } from '../../lib/dashboard/safe-to-spend';

export interface SafeToSpendCardProps {
  readonly breakdown: SafeToSpendBreakdown;
  readonly currency?: string;
}

function formatCurrencyAmount(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Math.max(0, amount) / 100);
}

export const SafeToSpendCard: React.FC<SafeToSpendCardProps> = ({
  breakdown,
  currency = 'USD',
}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const isPrivacyMode = useIsPrivacyModeActive();
  const displayAmount = Math.max(0, breakdown.safeToSpendCents);
  const isOverPlan = breakdown.safeToSpendCents < 0;
  const displayAmountText = isPrivacyMode
    ? 'a hidden amount'
    : formatCurrencyAmount(displayAmount, currency);

  const toggleBreakdown = useCallback(() => {
    setShowBreakdown((current) => !current);
  }, []);

  return (
    <article
      className={`card safe-to-spend-card safe-to-spend-card--${isOverPlan ? 'caution' : 'calm'}`}
      aria-label="Safe to spend this month"
    >
      <div className="safe-to-spend-card__content">
        <div>
          <p className="safe-to-spend-card__eyebrow">This month's spending answer</p>
          <h3 className="safe-to-spend-card__title">Safe to Spend This Month</h3>
        </div>
        <div className="safe-to-spend-card__amount" aria-live="polite">
          <CurrencyDisplay
            amount={displayAmount}
            currency={currency}
            context="safe to spend this month"
            aria-label={`${formatCurrencyAmount(displayAmount, currency)} safe to spend this month`}
          />
        </div>
        <p className="safe-to-spend-card__explanation">
          {isOverPlan
            ? 'Try to avoid extra spending this month after bills and savings.'
            : `You can still spend about ${displayAmountText} this month after bills and savings.`}
        </p>
        <button
          type="button"
          className="safe-to-spend-card__toggle"
          onClick={toggleBreakdown}
          aria-expanded={showBreakdown}
          aria-controls="safe-to-spend-breakdown"
        >
          {showBreakdown ? 'Hide' : 'Show'} simple breakdown
          <span aria-hidden="true">{showBreakdown ? ' ▲' : ' ▼'}</span>
        </button>
        {showBreakdown && (
          <dl id="safe-to-spend-breakdown" className="safe-to-spend-card__breakdown">
            <div>
              <dt>Income</dt>
              <dd>
                <CurrencyDisplay
                  amount={breakdown.expectedMonthlyIncomeCents}
                  currency={currency}
                />
              </dd>
            </div>
            <div>
              <dt>Bills left</dt>
              <dd>
                <CurrencyDisplay amount={breakdown.remainingBillsCents} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>Savings to set aside</dt>
              <dd>
                <CurrencyDisplay amount={breakdown.plannedSavingsCents} currency={currency} />
              </dd>
            </div>
            <div>
              <dt>Already spent</dt>
              <dd>
                <CurrencyDisplay amount={breakdown.discretionarySpentCents} currency={currency} />
              </dd>
            </div>
          </dl>
        )}
      </div>
    </article>
  );
};

export default SafeToSpendCard;
