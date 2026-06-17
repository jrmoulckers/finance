// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

export interface HealthScoreBadgeProps {
  score: number;
  label: string;
  size?: number;
}

export const HealthScoreBadge: React.FC<HealthScoreBadgeProps> = ({ score, label, size = 132 }) => {
  const clampedScore = Math.max(0, Math.min(score, 100));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (clampedScore / 100) * circumference;
  const tone =
    score >= 85 ? 'excellent' : score >= 70 ? 'strong' : score >= 50 ? 'stable' : 'warning';

  return (
    <div className={`health-score-badge health-score-badge--${tone}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        role="img"
        aria-label={`Financial health score ${clampedScore} out of 100, ${label}`}
      >
        <circle className="health-score-badge__track" cx="60" cy="60" r={radius} />
        <circle
          className="health-score-badge__progress"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={progress}
        />
      </svg>
      <div className="health-score-badge__content" aria-hidden="true">
        <strong className="health-score-badge__score">{clampedScore}</strong>
        <span className="health-score-badge__label">{label}</span>
      </div>
    </div>
  );
};
