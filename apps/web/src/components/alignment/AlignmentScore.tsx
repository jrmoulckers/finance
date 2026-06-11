// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { CurrencyDisplay } from '../common/CurrencyDisplay';
import type { AlignmentScoreResult } from '../../lib/alignment';
import './alignment.css';

export interface AlignmentScoreProps {
  result: AlignmentScoreResult;
  currencyCode: string;
}

function formatPercent(value: number): string {
  const percent = value * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

function getTone(score: number): 'excellent' | 'strong' | 'steady' | 'warning' {
  if (score >= 85) {
    return 'excellent';
  }

  if (score >= 70) {
    return 'strong';
  }

  if (score >= 50) {
    return 'steady';
  }

  return 'warning';
}

export const AlignmentScore: React.FC<AlignmentScoreProps> = ({ result, currencyCode }) => {
  const priorities = result.breakdown.filter((value) => value.priorityRank !== null).slice(0, 5);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset =
    circumference - (Math.max(0, Math.min(result.score, 100)) / 100) * circumference;
  const tone = getTone(result.score);

  return (
    <article
      className={`alignment-card alignment-card--score alignment-score alignment-score--${tone}`}
    >
      <div className="alignment-card__header">
        <div>
          <p className="alignment-card__eyebrow">Step 2 · See the match</p>
          <h3>Decision alignment score</h3>
          <p className="alignment-card__description">
            This compares your top five values against where this month's categorized spending and
            savings actually landed.
          </p>
        </div>
      </div>

      <div className="alignment-score__hero">
        <div className="alignment-score__badge" aria-hidden="true">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle className="alignment-score__track" cx="60" cy="60" r={radius} />
            <circle
              className="alignment-score__progress"
              cx="60"
              cy="60"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
            />
          </svg>
          <div className="alignment-score__badge-copy">
            <strong>{result.score}%</strong>
            <span>{result.label}</span>
          </div>
        </div>
        <dl className="alignment-score__stats">
          <div>
            <dt>Mapped spending analyzed</dt>
            <dd>
              <CurrencyDisplay
                amount={result.totalConsideredAmount}
                currency={currencyCode}
                context="value-aligned spending"
              />
            </dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{formatPercent(result.mappedCoverage)}</dd>
          </div>
        </dl>
      </div>

      <ul className="alignment-score__list" role="list">
        {priorities.map((value) => (
          <li key={value.valueId} className="alignment-score__list-item">
            <div className="alignment-score__list-copy">
              <div>
                <strong>{value.label}</strong>
                <span>
                  Target {formatPercent(value.targetShare)} · Actual{' '}
                  {formatPercent(value.actualShare)}
                </span>
              </div>
              <strong>{Math.round(Math.abs(value.gapShare) * 100)} pts</strong>
            </div>
            <div className="alignment-score__meter" aria-hidden="true">
              <span
                className="alignment-score__meter-fill"
                style={{
                  width: `${value.actualAmount > 0 ? Math.max(value.actualShare * 100, 4) : 0}%`,
                }}
              />
              <span
                className="alignment-score__meter-target"
                style={{ left: `${Math.min(value.targetShare * 100, 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
};
