// SPDX-License-Identifier: BUSL-1.1

import React, { useId, useMemo } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { AlignmentScoreResult } from '../../lib/alignment';
import { CHART_COLORS } from '../charts/chart-palette';
import './alignment.css';

export interface AlignmentRadarProps {
  result: AlignmentScoreResult;
}

function formatTooltipValue(value: unknown): string {
  const numericValue = Number(value ?? 0);
  return `${numericValue.toFixed(0)}%`;
}

export const AlignmentRadar: React.FC<AlignmentRadarProps> = ({ result }) => {
  const chartId = useId();
  const data = useMemo(
    () =>
      result.breakdown.map((value) => ({
        value: value.label,
        target: Math.round(value.targetShare * 100),
        actual: Math.round(value.actualShare * 100),
      })),
    [result.breakdown],
  );
  const description = data.length
    ? `Radar chart comparing target priorities to actual spending. ${data
        .map((item) => `${item.value}: target ${item.target}% and actual ${item.actual}%`)
        .join(', ')}.`
    : 'Radar chart with no value data.';

  return (
    <article className="alignment-card alignment-card--radar">
      <div className="alignment-card__header">
        <div>
          <p className="alignment-card__eyebrow">Step 3 · Spot the shape</p>
          <h3>Values vs. spending radar</h3>
          <p className="alignment-card__description">
            A wider blue area means your spending is matching the values you said matter most.
          </p>
        </div>
      </div>

      <div
        className="alignment-radar"
        role="figure"
        aria-labelledby={`${chartId}-title`}
        aria-describedby={`${chartId}-description`}
      >
        <h4 id={`${chartId}-title`} className="sr-only">
          Decision alignment radar chart
        </h4>
        <p id={`${chartId}-description`} className="sr-only">
          {description}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="var(--semantic-border-default, #D0D7DE)" />
            <PolarAngleAxis
              dataKey="value"
              tick={{ fill: 'var(--semantic-text-secondary, #57606A)' }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: 'var(--semantic-text-secondary, #57606A)' }}
              tickFormatter={(value) => `${value}%`}
            />
            <Radar
              name="Target"
              dataKey="target"
              stroke={CHART_COLORS[0]}
              fill={CHART_COLORS[0]}
              fillOpacity={0.12}
              isAnimationActive={false}
            />
            <Radar
              name="Actual"
              dataKey="actual"
              stroke={CHART_COLORS[5]}
              fill={CHART_COLORS[5]}
              fillOpacity={0.28}
              isAnimationActive={false}
            />
            <Legend />
            <Tooltip formatter={(value) => formatTooltipValue(value)} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
};
