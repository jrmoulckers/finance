// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { CurrencyDisplay } from '../common';
import type { SuggestedGoalProjection } from '../../lib/savings';

export interface GoalProjectionProps {
  readonly projection: SuggestedGoalProjection;
  readonly currencyCode: string;
}

function formatProjectionDate(date: string | null): string {
  if (!date) {
    return 'Keep contributing to unlock a projection';
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function GoalProjection({ projection, currencyCode }: GoalProjectionProps) {
  return (
    <section className="card" aria-label="Goal projection">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--spacing-3)',
          flexWrap: 'wrap',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        <div>
          <p className="card__title">Projected completion</p>
          <h3 style={{ margin: 0 }}>{formatProjectionDate(projection.projectedCompletionDate)}</h3>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.25rem 0.6rem',
            borderRadius: '999px',
            background: projection.onTrack ? 'rgba(5, 150, 105, 0.12)' : 'rgba(220, 38, 38, 0.12)',
            color: projection.onTrack ? '#047857' : '#B91C1C',
            fontWeight: 700,
          }}
        >
          {projection.onTrack ? 'On pace' : 'Needs a faster pace'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--spacing-3)',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        <div>
          <p className="card__title">Progress</p>
          <p className="card__value">{projection.completionPercent}%</p>
        </div>
        <div>
          <p className="card__title">Months to goal</p>
          <p className="card__value">{projection.monthsToGoal ?? '—'}</p>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <p className="card__title">Milestones</p>
        <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
          {projection.milestoneDates.map((milestone) => (
            <div
              key={milestone.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(15, 23, 42, 0.04)',
              }}
            >
              <strong>{milestone.label}</strong>
              <span style={{ color: 'var(--semantic-text-secondary)' }}>
                {formatProjectionDate(milestone.date)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="card__title">Trajectory preview</p>
        <div style={{ display: 'grid', gap: 'var(--spacing-2)' }}>
          {projection.trajectory.map((point) => (
            <div
              key={`${point.date}-${point.amountCents}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--spacing-3)',
              }}
            >
              <span>{formatProjectionDate(point.date)}</span>
              <strong>
                <CurrencyDisplay amount={point.amountCents} currency={currencyCode} />
              </strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default GoalProjection;
