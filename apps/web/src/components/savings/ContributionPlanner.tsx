// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { CurrencyDisplay } from '../common';
import {
  getContributionAmountForFrequency,
  type ContributionFrequency,
  type SuggestedSavingsGoal,
} from '../../lib/savings';

export interface ContributionPlannerProps {
  readonly suggestion: SuggestedSavingsGoal;
  readonly currencyCode: string;
  readonly monthlyContributionCents: number;
  readonly frequency: ContributionFrequency;
  readonly onMonthlyContributionChange: (monthlyContributionCents: number) => void;
  readonly onFrequencyChange: (frequency: ContributionFrequency) => void;
}

const FREQUENCY_LABELS: Record<ContributionFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

export function ContributionPlanner({
  suggestion,
  currencyCode,
  monthlyContributionCents,
  frequency,
  onMonthlyContributionChange,
  onFrequencyChange,
}: ContributionPlannerProps) {
  const perContributionCents = getContributionAmountForFrequency(
    monthlyContributionCents,
    frequency,
  );
  const sliderStep =
    Math.max(
      2_500,
      Math.round(suggestion.contributionPlan.stretchMonthlyContributionCents / 20 / 2_500) * 2_500,
    ) || 2_500;

  return (
    <section className="card" aria-label="Contribution planner">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 'var(--spacing-4)',
          flexWrap: 'wrap',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        <div>
          <p className="card__title">Contribution planner</p>
          <h3 style={{ margin: 0 }}>{suggestion.title}</h3>
          <p style={{ marginTop: 'var(--spacing-2)', color: 'var(--semantic-text-secondary)' }}>
            Tune the monthly amount, then pick the cadence that feels easiest to repeat.
          </p>
        </div>
        <div>
          <p className="card__title">Monthly contribution</p>
          <p className="card__value">
            <CurrencyDisplay amount={monthlyContributionCents} currency={currencyCode} />
          </p>
        </div>
      </div>

      <label htmlFor="savings-contribution-slider" style={{ display: 'block', fontWeight: 600 }}>
        Adjust your monthly amount
      </label>
      <input
        id="savings-contribution-slider"
        type="range"
        min={suggestion.contributionPlan.minimumMonthlyContributionCents}
        max={suggestion.contributionPlan.stretchMonthlyContributionCents}
        step={sliderStep}
        value={monthlyContributionCents}
        onChange={(event) => onMonthlyContributionChange(Number(event.target.value))}
        style={{ width: '100%', marginTop: 'var(--spacing-3)' }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--type-scale-caption-font-size)',
          color: 'var(--semantic-text-secondary)',
          marginTop: 'var(--spacing-2)',
        }}
      >
        <span>
          Min{' '}
          <CurrencyDisplay
            amount={suggestion.contributionPlan.minimumMonthlyContributionCents}
            currency={currencyCode}
          />
        </span>
        <span>
          Stretch{' '}
          <CurrencyDisplay
            amount={suggestion.contributionPlan.stretchMonthlyContributionCents}
            currency={currencyCode}
          />
        </span>
      </div>

      <div style={{ marginTop: 'var(--spacing-4)' }}>
        <p className="card__title">Cadence</p>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
          {(Object.keys(FREQUENCY_LABELS) as ContributionFrequency[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`form-button ${value === frequency ? 'form-button--primary' : 'form-button--secondary'}`}
              onClick={() => onFrequencyChange(value)}
              aria-pressed={value === frequency}
            >
              {FREQUENCY_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          marginTop: 'var(--spacing-4)',
          padding: 'var(--spacing-4)',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(15, 23, 42, 0.04)',
        }}
      >
        <p style={{ margin: 0, fontWeight: 600 }}>
          That works out to{' '}
          <CurrencyDisplay amount={perContributionCents} currency={currencyCode} /> {frequency}.
        </p>
        <p style={{ marginBottom: 0, color: 'var(--semantic-text-secondary)' }}>
          The base plan estimates about {suggestion.contributionPlan.estimatedMonths} months at the
          recommended pace.
        </p>
      </div>
    </section>
  );
}

export default ContributionPlanner;
