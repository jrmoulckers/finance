// SPDX-License-Identifier: BUSL-1.1

/**
 * TrendLineChart — Recharts line chart for financial trends over time.
 * CVD-safe palette, aria-label on SVG, keyboard navigable, prefers-reduced-motion.
 * @module components/charts/TrendLineChart
 */

import { type FC, useId, useMemo, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, formatChartCurrency } from './chart-palette';
import { useArrowKeyNavigation } from '../../accessibility/aria';

export interface TrendDataPoint {
  label: string;
  [seriesKey: string]: string | number;
}

export interface TrendSeries {
  dataKey: string;
  name: string;
}

export interface TrendLineChartProps {
  data: TrendDataPoint[];
  series: TrendSeries[];
  currency?: string;
  height?: number;
  title?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const TrendLineChart: FC<TrendLineChartProps> = ({
  data,
  series,
  currency = 'USD',
  height = 320,
  title = 'Trend over time',
}) => {
  const chartId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const disableAnimation = prefersReducedMotion();

  const description = useMemo(() => {
    if (data.length === 0) return 'Line chart with no data.';
    const seriesDesc = series
      .map((s) => {
        const values = data.map((d) =>
          typeof d[s.dataKey] === 'number' ? (d[s.dataKey] as number) : 0,
        );
        const min = Math.min(...values);
        const max = Math.max(...values);
        return `${s.name}: range ${formatChartCurrency(min, currency)} to ${formatChartCurrency(max, currency)}`;
      })
      .join('. ');
    return `Line chart "${title}" with ${data.length} data points and ${series.length} series. ${seriesDesc}.`;
  }, [data, series, currency, title]);

  const { handleKeyDown } = useArrowKeyNavigation(containerRef, {
    orientation: 'horizontal',
  });

  return (
    <div
      ref={containerRef}
      role="figure"
      aria-label={description}
      aria-roledescription="line chart"
      onKeyDown={handleKeyDown}
    >
      <h3 id={`${chartId}-title`} className="chart-title">
        {title}
      </h3>
      <p id={`${chartId}-desc`} className="sr-only">
        {description}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
          role="img"
          aria-labelledby={`${chartId}-title`}
          aria-describedby={`${chartId}-desc`}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default, #E5E7EB)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-secondary, #6B7280)', fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatChartCurrency(v, currency)}
            tick={{ fill: 'var(--color-text-secondary, #6B7280)', fontSize: 12 }}
            width={80}
          />
          <Tooltip
            formatter={(value) => formatChartCurrency(Number(value ?? 0), currency)}
            contentStyle={{
              background: 'var(--color-background-elevated, #FFFFFF)',
              border: '1px solid var(--color-border-default, #E5E7EB)',
              borderRadius: '0.375rem',
            }}
          />
          <Legend />
          {series.map((s, i) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4, tabIndex: -1, 'data-chart-point': '' } as Record<string, unknown>}
              activeDot={{ r: 6 }}
              isAnimationActive={!disableAnimation}
              animationDuration={600}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
