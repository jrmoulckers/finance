// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import type { MoodCorrelationSummary, MoodState } from '../../lib/wellness';

export interface MoodSpendingChartProps {
  correlation: MoodCorrelationSummary;
  currencyCode: string;
}

const MOOD_COLOR: Record<MoodState, string> = {
  calm: '#16A34A',
  neutral: '#64748B',
  anxious: '#F59E0B',
  stressed: '#EF4444',
  celebratory: '#8B5CF6',
  fatigued: '#0EA5E9',
};

function formatCompactCurrency(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount / 100);
}

function buildPolyline(
  values: readonly number[],
  width: number,
  height: number,
  min: number,
  max: number,
): string {
  if (values.length === 0) {
    return '';
  }

  const xStep = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const normalized = max === min ? 0.5 : (value - min) / (max - min);
      const x = index * xStep;
      const y = height - normalized * height;
      return `${x},${y}`;
    })
    .join(' ');
}

export const MoodSpendingChart: React.FC<MoodSpendingChartProps> = ({
  correlation,
  currencyCode,
}) => {
  if (correlation.chart.length === 0) {
    return <p className="wellness-overview__empty-copy">{correlation.summary}</p>;
  }

  const width = 560;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 16 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxSpending = Math.max(
    ...correlation.chart.flatMap((point) => [point.spending, point.baseline]),
    1,
  );
  const spendingPoints = buildPolyline(
    correlation.chart.map((point) => point.spending),
    innerWidth,
    innerHeight,
    0,
    maxSpending,
  );
  const baselinePoints = buildPolyline(
    correlation.chart.map((point) => point.baseline),
    innerWidth,
    innerHeight,
    0,
    maxSpending,
  );
  const moodPoints = buildPolyline(
    correlation.chart.map((point) => point.moodScore),
    innerWidth,
    innerHeight,
    0,
    100,
  );

  return (
    <div className="wellness-chart">
      <div className="wellness-chart__header">
        <div>
          <h3>Mood vs spending over time</h3>
          <p>{correlation.summary}</p>
        </div>
        <div className="wellness-chart__legend" aria-hidden="true">
          <span>
            <i className="wellness-chart__legend-swatch wellness-chart__legend-swatch--spending" />
            Spending
          </span>
          <span>
            <i className="wellness-chart__legend-swatch wellness-chart__legend-swatch--baseline" />
            Baseline
          </span>
          <span>
            <i className="wellness-chart__legend-swatch wellness-chart__legend-swatch--mood" />
            Mood stress
          </span>
        </div>
      </div>

      <svg
        className="wellness-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Mood and spending chart with ${correlation.chart.length} points. Spending averages ${formatCompactCurrency(correlation.averageTaggedSpending, currencyCode)} when moods are tagged.`}
      >
        <g transform={`translate(${padding.left} ${padding.top})`}>
          {[0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              className="wellness-chart__grid"
              x1={0}
              x2={innerWidth}
              y1={innerHeight - innerHeight * fraction}
              y2={innerHeight - innerHeight * fraction}
            />
          ))}
          <polyline
            className="wellness-chart__line wellness-chart__line--baseline"
            points={baselinePoints}
          />
          <polyline
            className="wellness-chart__line wellness-chart__line--spending"
            points={spendingPoints}
          />
          <polyline
            className="wellness-chart__line wellness-chart__line--mood"
            points={moodPoints}
          />
          {correlation.chart.map((point, index) => {
            const xStep =
              correlation.chart.length > 1 ? innerWidth / (correlation.chart.length - 1) : 0;
            const x = index * xStep;
            const spendingY = innerHeight - (point.spending / maxSpending) * innerHeight;
            return (
              <circle
                key={point.date}
                cx={x}
                cy={spendingY}
                r={5}
                className="wellness-chart__dot"
                style={{ fill: MOOD_COLOR[point.moodState] }}
              />
            );
          })}
        </g>
      </svg>

      <div className="wellness-chart__labels" aria-hidden="true">
        {correlation.chart.map((point) => (
          <div key={point.date} className="wellness-chart__label-item">
            <span>{point.label}</span>
            <strong style={{ color: MOOD_COLOR[point.moodState] }}>{point.moodLabel}</strong>
          </div>
        ))}
      </div>
    </div>
  );
};
