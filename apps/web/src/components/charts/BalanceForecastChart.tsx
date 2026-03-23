// SPDX-License-Identifier: BUSL-1.1

/**
 * BalanceForecastChart — Recharts line chart showing actual vs projected
 * balance over the current month.
 *
 * - Solid line for actual data points (past/today)
 * - Dashed line for projected future data points
 * - Shaded area between to visualise uncertainty
 * - Fully accessible: role="figure", aria-roledescription, screen-reader
 *   description, keyboard navigation, prefers-reduced-motion support
 *
 * @module components/charts/BalanceForecastChart
 * References: issue #324
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
  Area,
  ComposedChart,
} from 'recharts';
import { CHART_COLORS, formatChartCurrency } from './chart-palette';
import { useArrowKeyNavigation } from '../../accessibility/aria';
import type { BalanceProjection } from '../../hooks/usePredictiveBalance';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BalanceForecastChartProps {
  /** Daily balance projections from the start to end of the month. */
  projections: BalanceProjection[];
  /** ISO 4217 currency code for formatting. */
  currency?: string;
  /** Chart height in pixels. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Shape of each data point fed into the ComposedChart. */
interface ChartDataPoint {
  label: string;
  actual: number | null;
  projected: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BalanceForecastChart: FC<BalanceForecastChartProps> = ({
  projections,
  currency = 'USD',
  height = 320,
}) => {
  const chartId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const disableAnimation = prefersReducedMotion();

  // Transform projections into chart-friendly data.
  // The "actual" series has values up to today; "projected" continues from
  // today through end of month. They share today's point so the lines connect.
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (projections.length === 0) return [];

    // Find the last actual data point index (the point where actual !== null)
    const lastActualIdx = projections.reduce((last, p, i) => (p.actual !== null ? i : last), -1);

    return projections.map((p, i) => ({
      label: p.label,
      actual: p.actual !== null ? p.actual / 100 : null,
      // Start projected series from the last actual point onward
      projected: i >= lastActualIdx ? p.projected / 100 : null,
    }));
  }, [projections]);

  // Build a human-readable description for screen readers.
  const description = useMemo(() => {
    if (projections.length === 0) return 'Balance forecast chart with no data.';

    const actuals = projections.filter((p) => p.actual !== null);
    const futures = projections.filter((p) => p.actual === null);
    const lastProjected = projections[projections.length - 1];

    const parts: string[] = [`Balance forecast chart for ${projections.length} days.`];

    if (actuals.length > 0) {
      const firstActual = actuals[0]!;
      const lastActual = actuals[actuals.length - 1]!;
      parts.push(
        `Actual balance from ${firstActual.label} (${formatChartCurrency(firstActual.actual! / 100, currency)}) ` +
          `to ${lastActual.label} (${formatChartCurrency(lastActual.actual! / 100, currency)}).`,
      );
    }

    if (futures.length > 0 && lastProjected) {
      parts.push(
        `Projected to reach ${formatChartCurrency(lastProjected.projected / 100, currency)} by ${lastProjected.label}.`,
      );
    }

    return parts.join(' ');
  }, [projections, currency]);

  const { handleKeyDown } = useArrowKeyNavigation(containerRef, {
    orientation: 'horizontal',
  });

  const title = 'Balance Forecast';

  return (
    <div
      ref={containerRef}
      role="figure"
      aria-label={description}
      aria-roledescription="balance forecast chart"
      onKeyDown={handleKeyDown}
    >
      <h4 id={`${chartId}-title`} className="chart-title">
        {title}
      </h4>
      <p id={`${chartId}-desc`} className="sr-only">
        {description}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
          role="img"
          aria-labelledby={`${chartId}-title`}
          aria-describedby={`${chartId}-desc`}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default, #E5E7EB)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-secondary, #6B7280)', fontSize: 12 }}
            interval="preserveStartEnd"
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

          {/* Shaded area for the projected zone */}
          <Area
            type="monotone"
            dataKey="projected"
            name="Projected Range"
            fill={CHART_COLORS[0]}
            fillOpacity={0.1}
            stroke="none"
            isAnimationActive={!disableAnimation}
            animationDuration={600}
            connectNulls={false}
          />

          {/* Solid line for actual balance */}
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 2 } as Record<string, unknown>}
            activeDot={{ r: 5 }}
            isAnimationActive={!disableAnimation}
            animationDuration={600}
            connectNulls={false}
          />

          {/* Dashed line for projected balance */}
          <Line
            type="monotone"
            dataKey="projected"
            name="Projected"
            stroke={CHART_COLORS[2]}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 5 }}
            isAnimationActive={!disableAnimation}
            animationDuration={600}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
