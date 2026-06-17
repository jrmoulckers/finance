// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import type { AnxietyScoreResult } from '../../lib/wellness';

export interface AnxietyGaugeProps {
  result: AnxietyScoreResult;
  size?: number;
}

const TONE_BY_LEVEL: Record<AnxietyScoreResult['level'], string> = {
  low: 'calm',
  moderate: 'watch',
  high: 'high',
  severe: 'severe',
};

const LABEL_BY_LEVEL: Record<AnxietyScoreResult['level'], string> = {
  low: 'Low anxiety',
  moderate: 'Watchful',
  high: 'Elevated',
  severe: 'High stress',
};

export const AnxietyGauge: React.FC<AnxietyGaugeProps> = ({ result, size = 148 }) => {
  const clampedScore = Math.max(0, Math.min(result.score, 100));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = circumference - (clampedScore / 100) * circumference;
  const tone = TONE_BY_LEVEL[result.level];

  return (
    <div className={`anxiety-gauge anxiety-gauge--${tone}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 140 140"
        role="img"
        aria-label={`Financial anxiety score ${clampedScore} out of 100. Lower is better. Current level: ${LABEL_BY_LEVEL[result.level]}.`}
      >
        <circle className="anxiety-gauge__track" cx="70" cy="70" r={radius} />
        <circle
          className="anxiety-gauge__progress"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={progress}
        />
      </svg>
      <div className="anxiety-gauge__content" aria-hidden="true">
        <strong className="anxiety-gauge__score">{clampedScore}</strong>
        <span className="anxiety-gauge__label">{LABEL_BY_LEVEL[result.level]}</span>
        <span className="anxiety-gauge__caption">Lower is better</span>
      </div>
    </div>
  );
};
