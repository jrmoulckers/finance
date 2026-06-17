// SPDX-License-Identifier: BUSL-1.1

/**
 * TrendLineChart — Recharts line chart for financial trends over time.
 * CVD-safe palette, aria-label on SVG, keyboard navigable, prefers-reduced-motion.
 * @module components/charts/TrendLineChart
 */

import { type FC, useId, useMemo } from 'react';
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
import {
  AccessibleChartDataTable,
  CHART_KEYBOARD_INSTRUCTIONS,
  useChartKeyboardNavigation,
} from './chart-accessibility';
import { buildChartTextSummary } from '../../lib/a11y/chart-table-audit';

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

  const dataPointRows = useMemo(
    () =>
      data.map((point, index) => {
        const values = series.map((trendSeries) => {
          const rawValue =
            typeof point[trendSeries.dataKey] === 'number' ? Number(point[trendSeries.dataKey]) : 0;
          return {
            name: trendSeries.name,
            formattedValue: formatChartCurrency(rawValue, currency),
          };
        });

        return {
          id: `${chartId}-point-${index}`,
          rowHeader: point.label,
          cells: values.map((value) => value.formattedValue),
          ariaLabel: `${point.label}: ${values.map((value) => `${value.name} ${value.formattedValue}`).join(', ')}`,
          announcement: buildChartTextSummary({
            title,
            timeframe: point.label,
            trendDescription: `Focused point ${index + 1} of ${data.length}.`,
            points: values.map((value) => ({
              label: point.label,
              series: value.name,
              value: value.formattedValue,
            })),
            maxPoints: values.length,
          }),
        };
      }),
    [chartId, currency, data, series, title],
  );

  const { announcement, handleFocus, handleKeyDown } = useChartKeyboardNavigation(dataPointRows);

  return (
    <div role="figure" aria-label={description} aria-roledescription="line chart">
      <h3 id={`${chartId}-title`} className="chart-title">
        {title}
      </h3>
      <p id={`${chartId}-desc`} className="sr-only">
        {description}
      </p>
      <p id={`${chartId}-instructions`} className="sr-only">
        {CHART_KEYBOARD_INSTRUCTIONS}
      </p>
      {data.length > 0 && (
        <div
          role="group"
          aria-label={`${title} data navigator`}
          aria-roledescription="interactive chart"
          aria-describedby={`${chartId}-desc ${chartId}-instructions ${chartId}-table-caption ${chartId}-live`}
          aria-keyshortcuts="ArrowLeft ArrowRight Home End"
          tabIndex={0}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        >
          <ResponsiveContainer width="100%" height={height}>
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
              role="img"
              aria-label={description}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--semantic-border-default, #E5E7EB)"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--semantic-text-secondary, #6B7280)', fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v: number) => formatChartCurrency(v, currency)}
                tick={{ fill: 'var(--semantic-text-secondary, #6B7280)', fontSize: 12 }}
                width={80}
              />
              <Tooltip
                formatter={(value) => formatChartCurrency(Number(value ?? 0), currency)}
                contentStyle={{
                  background: 'var(--semantic-background-elevated, #FFFFFF)',
                  border: '1px solid var(--semantic-border-default, #E5E7EB)',
                  borderRadius: '0.375rem',
                }}
              />
              <Legend />
              {series.map((trendSeries, index) => (
                <Line
                  key={trendSeries.dataKey}
                  type="monotone"
                  dataKey={trendSeries.dataKey}
                  name={trendSeries.name}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={!disableAnimation}
                  animationDuration={600}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div
        id={`${chartId}-live`}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
      <AccessibleChartDataTable
        captionId={`${chartId}-table-caption`}
        title={title}
        rowHeaderLabel="Period"
        columns={series.map((trendSeries) => ({
          key: trendSeries.dataKey,
          header: trendSeries.name,
        }))}
        rows={dataPointRows}
      />
    </div>
  );
};
