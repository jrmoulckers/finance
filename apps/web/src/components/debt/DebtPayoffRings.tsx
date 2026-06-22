// SPDX-License-Identifier: BUSL-1.1

/**
 * DebtPayoffRings — a highly visual, "fitness rings" debt-payoff surface (#2175).
 *
 * For a selected loan/debt account it renders:
 *  - a payoff progress ring (paid principal vs. original principal) with a full
 *    text alternative so it never relies on colour alone;
 *  - the estimated payoff date and time remaining;
 *  - a payoff milestone ladder (25 / 50 / 75 / 100%);
 *  - an extra-payment "what if" comparison (months saved + interest saved).
 *
 * All financial maths lives in the pure engine at `lib/debt/payoff.ts`; this
 * component is purely presentational and accessible. Data arrives via props
 * (never a direct repository import).
 *
 * Accessibility:
 *  - The ring is an `img` with an aria-label describing the value in words.
 *  - Inputs are labelled; computed what-if results announce via `aria-live`.
 *  - Milestone state is conveyed with text + icon, not colour alone.
 *  - Ring animation is disabled under `prefers-reduced-motion` (see CSS).
 */

import React, { useId, useMemo, useState } from 'react';
import { EmptyState } from '../common';
import {
  buildPayoffRingViewModel,
  formatUsdCents,
  type LoanPayoffInput,
} from '../../lib/debt/payoff';
import type { Debt } from '../../lib/debt-types';
import './DebtPayoffRings.css';

export interface DebtPayoffRingsProps {
  /** Loan/debt accounts to visualise. */
  readonly debts: readonly Debt[];
  /** Anchor date (YYYY-MM-DD) for payoff projections. Defaults to today. */
  readonly todayIso?: string;
}

const RING_RADIUS = 52;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function toLoanInput(debt: Debt): LoanPayoffInput {
  return {
    id: debt.id,
    name: debt.name,
    balanceCents: debt.balanceCents,
    originalPrincipalCents: Math.max(
      debt.originalBalanceCents ?? debt.balanceCents,
      debt.balanceCents,
    ),
    annualRateBps: debt.annualRateBps,
    minimumPaymentCents: debt.minimumPaymentCents,
  };
}

function parseExtraPaymentCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

export function DebtPayoffRings({ debts, todayIso }: DebtPayoffRingsProps): React.ReactElement {
  const baseId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [extraPayment, setExtraPayment] = useState('');

  const selectedDebt = useMemo(() => {
    if (debts.length === 0) return null;
    return debts.find((debt) => debt.id === selectedId) ?? debts[0];
  }, [debts, selectedId]);

  const extraPaymentCents = parseExtraPaymentCents(extraPayment);

  const viewModel = useMemo(() => {
    if (!selectedDebt) return null;
    return buildPayoffRingViewModel(toLoanInput(selectedDebt), extraPaymentCents, {
      startDateIso: todayIso,
    });
  }, [selectedDebt, extraPaymentCents, todayIso]);

  const titleId = `${baseId}-title`;
  const selectId = `${baseId}-debt`;
  const extraId = `${baseId}-extra`;
  const resultsId = `${baseId}-results`;

  if (!selectedDebt || !viewModel) {
    return (
      <EmptyState
        title="No debt accounts to visualize"
        description="Add a loan or debt account to see payoff progress rings, your estimated payoff date, and how extra payments cut interest."
      />
    );
  }

  const { progress, milestones, comparison, activeProjection } = viewModel;
  const clampedPercent = Math.max(0, Math.min(100, progress.percentPaid));
  const dashOffset = RING_CIRCUMFERENCE * (1 - clampedPercent / 100);

  return (
    <section className="debt-payoff-rings" aria-labelledby={titleId}>
      <header className="debt-payoff-rings__header">
        <h2 id={titleId}>Payoff Rings</h2>
        <p className="debt-payoff-rings__subtitle">
          Close each debt like a fitness ring. Track payoff progress, your estimated payoff date,
          and how extra payments shrink interest.
        </p>
      </header>

      {debts.length > 1 && (
        <div className="debt-payoff-rings__selector">
          <label htmlFor={selectId}>Debt account</label>
          <select
            id={selectId}
            value={selectedDebt.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {debts.map((debt) => (
              <option key={debt.id} value={debt.id}>
                {debt.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="debt-payoff-rings__card">
        <div className="debt-payoff-ring" role="img" aria-label={viewModel.ringAriaLabel}>
          <svg
            className="debt-payoff-ring__svg"
            viewBox="0 0 120 120"
            aria-hidden="true"
            focusable="false"
          >
            <circle className="debt-payoff-ring__track" cx="60" cy="60" r={RING_RADIUS} />
            <circle
              className="debt-payoff-ring__value"
              cx="60"
              cy="60"
              r={RING_RADIUS}
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span className="debt-payoff-ring__percent" aria-hidden="true">
            {Math.round(clampedPercent)}%
          </span>
        </div>

        <div className="debt-payoff-rings__summary">
          <p className="debt-payoff-rings__progress-text">{progress.textAlternative}</p>
          <dl className="debt-payoff-rings__stats">
            <div className="debt-payoff-rings__stat">
              <dt>Estimated payoff date</dt>
              <dd>{viewModel.payoffDateLabel}</dd>
            </div>
            <div className="debt-payoff-rings__stat">
              <dt>Time remaining</dt>
              <dd>{viewModel.payoffDurationLabel}</dd>
            </div>
            <div className="debt-payoff-rings__stat">
              <dt>Projected interest</dt>
              <dd>
                {activeProjection.amortizes
                  ? formatUsdCents(activeProjection.totalInterestCents)
                  : 'Not on track'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="debt-payoff-rings__milestones" aria-label="Payoff milestones">
        <h3>Milestones</h3>
        <ul className="debt-milestone-list" role="list">
          {milestones.map((milestone) => (
            <li
              key={milestone.thresholdPercent}
              className="debt-milestone"
              data-reached={milestone.isReached}
            >
              <span className="debt-milestone__icon" aria-hidden="true">
                {milestone.isReached ? '✓' : '○'}
              </span>
              <span className="debt-milestone__label">{milestone.label}</span>
              <span className="debt-milestone__status">
                {milestone.isReached ? 'Reached' : 'In progress'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="debt-payoff-rings__whatif" aria-label="Extra payment what-if comparison">
        <h3>What if you pay extra?</h3>
        <div className="debt-payoff-rings__whatif-input">
          <label htmlFor={extraId}>Extra monthly payment ($)</label>
          <input
            id={extraId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={extraPayment}
            onChange={(event) => setExtraPayment(event.target.value)}
            aria-describedby={resultsId}
          />
        </div>
        <div
          id={resultsId}
          className="debt-payoff-rings__whatif-results"
          role="status"
          aria-live="polite"
        >
          <p className="debt-payoff-rings__savings">{viewModel.savingsMessage}</p>
          {comparison.hasImpact && (
            <dl className="debt-payoff-rings__savings-stats">
              <div className="debt-payoff-rings__stat">
                <dt>Months saved</dt>
                <dd>{comparison.monthsSaved}</dd>
              </div>
              <div className="debt-payoff-rings__stat">
                <dt>Interest saved</dt>
                <dd>{formatUsdCents(comparison.interestSavedCents)}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>
    </section>
  );
}

export default DebtPayoffRings;
