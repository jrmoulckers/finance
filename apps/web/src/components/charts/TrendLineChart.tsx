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
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, formatChartCurrency } from './chart-palette';
import {
  AccessibleChartDataTable,
  CHART_KEYBOARD_INSTRUCTIONS,
  useChartKeyboardNavigation,
} from './chart-accessibility';
import { buildChartTextSummary } from '../../lib/a11y/chart-table-audit';
import './trend-line-chart.css';

/**
 * Per-series stroke patterns. Colour alone must never be the only way to tell
 * two lines apart (WCAG 2.2 SC 1.4.1 Use of Color), so each series also gets a
 * distinct dash pattern that is mirrored in the legend swatch and label. The
 * cycle is deliberately small and high-contrast between neighbours.
 */
interface SeriesPattern {
  /** SVG `strokeDasharray`; `undefined` renders a solid line. */
  readonly dash?: string;
  /** Human-readable pattern name, surfaced in the legend and a11y summary. */
  readonly name: string;
}

const SERIES_PATTERNS: readonly SeriesPattern[] = [
  { dash: undefined, name: 'solid' },
  { dash: '6 5', name: 'dashed' },
  { dash: '2 4', name: 'dotted' },
  { dash: '8 4 2 4', name: 'dash-dot' },
  { dash: '10 6', name: 'long-dashed' },
  { dash: '1 6', name: 'fine-dotted' },
];

/** Resolve the stroke pattern for a series by its index (cycles the set). */
function seriesPattern(index: number): SeriesPattern {
  return SERIES_PATTERNS[index % SERIES_PATTERNS.length];
}

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
      .map((s, index) => {
        const values = data.map((d) =>
          typeof d[s.dataKey] === 'number' ? (d[s.dataKey] as number) : 0,
        );
        const min = Math.min(...values);
        const max = Math.max(...values);
        return `${s.name} (${seriesPattern(index).name} line): range ${formatChartCurrency(min, currency)} to ${formatChartCurrency(max, currency)}`;
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
              {series.map((trendSeries, index) => (
                <Line
                  key={trendSeries.dataKey}
                  type="monotone"
                  dataKey={trendSeries.dataKey}
                  name={trendSeries.name}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                  strokeDasharray={seriesPattern(index).dash}
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
      {data.length > 0 && (
        <ul className="trend-chart__legend" aria-label={`${title} legend`}>
          {series.map((trendSeries, index) => {
            const pattern = seriesPattern(index);
            return (
              <li key={trendSeries.dataKey} className="trend-chart__legend-item">
                <svg
                  className="trend-chart__legend-swatch"
                  width="28"
                  height="10"
                  viewBox="0 0 28 10"
                  aria-hidden="true"
                  focusable="false"
                >
                  <line
                    x1="0"
                    y1="5"
                    x2="28"
                    y2="5"
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeWidth="2"
                    strokeDasharray={pattern.dash}
                  />
                </svg>
                <span>{`${trendSeries.name} (${pattern.name} line)`}</span>
              </li>
            );
          })}
        </ul>
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
