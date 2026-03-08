// SPDX-License-Identifier: BUSL-1.1

/**
 * SpendingBarChart — Recharts bar chart for spending by category.
 * CVD-safe palette, aria-label on SVG, keyboard navigable, prefers-reduced-motion.
 * @module components/charts/SpendingBarChart
 */

import { type FC, useCallback, useId, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { CHART_COLORS, buildChartDescription, formatChartCurrency } from './chart-palette';
import { useArrowKeyNavigation } from '../../accessibility/aria';

export interface SpendingCategory {
  name: string;
  amount: number;
}

export interface SpendingBarChartProps {
  data: SpendingCategory[];
  currency?: string;
  height?: number;
  title?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const SpendingBarChart: FC<SpendingBarChartProps> = ({
  data,
  currency = 'USD',
  height = 320,
  title = 'Spending by category',
}) => {
  const chartId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const description = useMemo(
    () => buildChartDescription(
      'Bar chart',
      data.map((d) => ({ label: d.name, value: d.amount })),
      currency,
    ),
    [data, currency],
  );

  const { handleKeyDown } = useArrowKeyNavigation(containerRef, {
    orientation: 'horizontal',
    onFocus: useCallback((_index: number) => {}, []),
  });

  const disableAnimation = prefersReducedMotion();

  return (
    <div
      ref={containerRef}
      role="figure"
      aria-label={description}
      aria-roledescription="bar chart"
      onKeyDown={handleKeyDown}
    >
      <h3 id={`${chartId}-title`} className="chart-title">{title}</h3>
      <p id={`${chartId}-desc`} className="sr-only">{description}</p>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
          aria-labelledby={`${chartId}-title`}
          aria-describedby={`${chartId}-desc`}
          role="img"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default, #E5E7EB)" />
          <XAxis dataKey="name" tick={{ fill: 'var(--color-text-secondary, #6B7280)', fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => formatChartCurrency(v, currency)}
            tick={{ fill: 'var(--color-text-secondary, #6B7280)', fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value: number) => formatChartCurrency(value, currency)}
            contentStyle={{
              background: 'var(--color-background-elevated, #FFFFFF)',
              border: '1px solid var(--color-border-default, #E5E7EB)',
              borderRadius: '0.375rem',
            }}
          />
          <Bar dataKey="amount" isAnimationActive={!disableAnimation} animationDuration={600}>
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                data-chart-point=""
                tabIndex={-1}
                role="listitem"
                aria-label={`${entry.name}: ${formatChartCurrency(entry.amount, currency)}`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};