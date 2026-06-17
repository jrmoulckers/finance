// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCurrencyValue } from '../../lib/currency';
import { calculateMoodCorrelations, type MoodJournalEntry } from '../../lib/mood';

function formatCorrelationLabel(value: number): string {
  if (value > 0) {
    return `+${value.toFixed(2)}`;
  }

  return value.toFixed(2);
}

export interface SpendingMoodChartProps {
  entries: readonly MoodJournalEntry[];
  currency?: string;
}

export const SpendingMoodChart: React.FC<SpendingMoodChartProps> = ({
  entries,
  currency = 'USD',
}) => {
  const chartData = useMemo(() => {
    const grouped = new Map<
      string,
      {
        spendingCents: number;
        moodTotal: number;
        count: number;
      }
    >();

    for (const entry of entries) {
      const existing = grouped.get(entry.date) ?? { spendingCents: 0, moodTotal: 0, count: 0 };
      existing.spendingCents += entry.spending.totalCents;
      existing.moodTotal += entry.moodLevel;
      existing.count += 1;
      grouped.set(entry.date, existing);
    }

    return Array.from(grouped, ([date, value]) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      spending: value.spendingCents / 100,
      moodLevel: Number((value.moodTotal / value.count).toFixed(1)),
    })).slice(-14);
  }, [entries]);

  const correlations = useMemo(() => calculateMoodCorrelations(entries), [entries]);

  if (entries.length === 0) {
    return (
      <section className="mood-chart" aria-label="Spending and mood chart">
        <h4 className="mood-chart__title">Mood vs. spending</h4>
        <p className="mood-chart__empty">
          Add a few check-ins to compare your mood with spending swings.
        </p>
      </section>
    );
  }

  return (
    <section className="mood-chart" aria-label="Spending and mood chart">
      <div className="mood-chart__header">
        <div>
          <h4 className="mood-chart__title">Mood vs. spending</h4>
          <p className="mood-chart__subtitle">
            Overlay your daily mood score with same-day spending totals.
          </p>
        </div>
        <dl className="mood-chart__summary">
          <div>
            <dt>Correlation</dt>
            <dd>{formatCorrelationLabel(correlations.overall.coefficient)}</dd>
          </div>
          <div>
            <dt>Direction</dt>
            <dd>{correlations.overall.direction}</dd>
          </div>
          <div>
            <dt>Strength</dt>
            <dd>{correlations.overall.strength}</dd>
          </div>
        </dl>
      </div>

      <div className="mood-chart__canvas">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis yAxisId="spend" tickFormatter={(value) => `$${value}`} />
            <YAxis yAxisId="mood" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} />
            <Tooltip
              formatter={(value, name) => {
                const numericValue = typeof value === 'number' ? value : Number(value ?? 0);

                if (name === 'Spending') {
                  return [formatCurrencyValue(numericValue, { currency }), 'Spending'];
                }

                return [`${numericValue}/5`, 'Mood'];
              }}
            />
            <Legend />
            <Bar
              yAxisId="spend"
              dataKey="spending"
              name="Spending"
              fill="#7c3aed"
              radius={[6, 6, 0, 0]}
            />
            <Line
              yAxisId="mood"
              type="monotone"
              dataKey="moodLevel"
              name="Mood"
              stroke="#10b981"
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

export default SpendingMoodChart;
