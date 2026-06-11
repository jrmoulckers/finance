// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import type { LearningBadge } from '../../lib/learning';

type ProgressBadgeProps =
  | {
      variant: 'badge';
      badge: LearningBadge;
    }
  | {
      variant: 'streak';
      currentStreakDays: number;
      longestStreakDays: number;
    };

export function ProgressBadge(props: ProgressBadgeProps): React.ReactElement {
  if (props.variant === 'streak') {
    return (
      <article className="progress-badge progress-badge--streak" aria-label="Learning streak">
        <p className="progress-badge__eyebrow">Current streak</p>
        <p className="progress-badge__value">
          {props.currentStreakDays} day{props.currentStreakDays === 1 ? '' : 's'}
        </p>
        <p className="progress-badge__description">
          Best run: {props.longestStreakDays} day{props.longestStreakDays === 1 ? '' : 's'}
        </p>
      </article>
    );
  }

  const { badge } = props;

  return (
    <article
      className={[
        'progress-badge',
        `progress-badge--${badge.tone}`,
        badge.earned ? 'progress-badge--earned' : 'progress-badge--locked',
      ].join(' ')}
      aria-label={`${badge.title}: ${badge.earned ? 'earned' : 'locked'}`}
    >
      <p className="progress-badge__eyebrow">{badge.earned ? 'Unlocked' : 'In progress'}</p>
      <p className="progress-badge__value">{badge.title}</p>
      <p className="progress-badge__description">{badge.description}</p>
      {badge.earnedAt && (
        <p className="progress-badge__meta">Earned {badge.earnedAt.slice(0, 10)}</p>
      )}
    </article>
  );
}

export default ProgressBadge;
