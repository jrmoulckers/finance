// SPDX-License-Identifier: BUSL-1.1

/**
 * SpendingBarChart — Recharts bar chart for spending by category.
 * CVD-safe palette, aria-label on SVG, keyboard navigable, prefers-reduced-motion.
 * @module components/charts/SpendingBarChart
 */

import { type FC, useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  CHART_COLORS,
  buildCategoryCaption,
  buildChartDescription,
  formatChartCurrency,
} from './chart-palette';
import { AccessibleChartDataTable } from './chart-accessibility';
import { ChartEmptyState } from './ChartEmptyState';
import { useArrowKeyNavigation } from '../../accessibility/aria';
import { useEffectiveMaskingMode } from '../../contexts/PrivacyModeContext';

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
  const maskingMode = useEffectiveMaskingMode();
  const [announcement, setAnnouncement] = useState('');

  const description = useMemo(
    () =>
      buildChartDescription(
        'Bar chart',
        data.map((d) => ({ label: d.name, value: d.amount })),
        currency,
        maskingMode,
      ),
    [data, currency, maskingMode],
  );

  const caption = useMemo(
    () =>
      buildCategoryCaption(
        data.map((d) => ({ name: d.name, value: d.amount })),
        currency,
        maskingMode,
      ),
    [data, currency, maskingMode],
  );

  const pointAnnouncements = useMemo(
    () =>
      data.map(
        (entry, index) =>
          `${title}. Focused category ${index + 1} of ${data.length}. ${entry.name}: ${formatChartCurrency(entry.amount, currency, 'en-US', maskingMode)}.`,
      ),
    [currency, data, maskingMode, title],
  );
  const { handleKeyDown } = useArrowKeyNavigation(containerRef, {
    orientation: 'horizontal',
    onFocus: useCallback(
      (index: number) => setAnnouncement(pointAnnouncements[index] ?? ''),
      [pointAnnouncements],
    ),
  });

  const disableAnimation = prefersReducedMotion();

  const total = useMemo(() => data.reduce((sum, entry) => sum + entry.amount, 0), [data]);
  const tableRows = useMemo(
    () =>
      data.map((entry, index) => {
        const percent = total > 0 ? ((entry.amount / total) * 100).toFixed(1) : '0.0';
        const formattedValue = formatChartCurrency(entry.amount, currency, 'en-US', maskingMode);
        return {
          id: `${chartId}-row-${index}`,
          rowHeader: entry.name,
          cells: [formattedValue, `${percent}%`],
          ariaLabel: `${entry.name}: ${formattedValue} (${percent}%)`,
        };
      }),
    [chartId, currency, data, maskingMode, total],
  );

  if (data.length === 0) {
    return <ChartEmptyState title={title} titleId={`${chartId}-title`} />;
  }

  return (
    <div
      ref={containerRef}
      className="spending-bar-chart"
      role="figure"
      aria-label={description}
      aria-roledescription="bar chart"
      onKeyDown={handleKeyDown}
    >
      <h3 id={`${chartId}-title`} className="chart-title">
        {title}
      </h3>
      {caption && (
        <p className="chart-caption" aria-hidden="true">
          {caption}
        </p>
      )}
      <p id={`${chartId}-desc`} className="sr-only">
        {description}
      </p>
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Chart point announcement"
      >
        {announcement}
      </div>
      <div className="spending-bar-chart__plot">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
            aria-labelledby={`${chartId}-title`}
            aria-describedby={`${chartId}-desc`}
            role="img"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--semantic-border-default, #E5E7EB)" />
            <XAxis
              dataKey="name"
              tick={{ fill: 'var(--semantic-text-secondary, #6B7280)', fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(v: number) => formatChartCurrency(v, currency, 'en-US', maskingMode)}
              tick={{ fill: 'var(--semantic-text-secondary, #6B7280)', fontSize: 12 }}
              width={80}
            />
            <Tooltip
              formatter={(value) =>
                formatChartCurrency(Number(value ?? 0), currency, 'en-US', maskingMode)
              }
              contentStyle={{
                background: 'var(--semantic-background-elevated, #FFFFFF)',
                border: '1px solid var(--semantic-border-default, #E5E7EB)',
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
                  aria-label={`${entry.name}: ${formatChartCurrency(entry.amount, currency, 'en-US', maskingMode)}`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > 0 && (
        <AccessibleChartDataTable
          captionId={`${chartId}-table-caption`}
          title={title}
          rowHeaderLabel="Category"
          columns={[
            { key: 'amount', header: 'Amount' },
            { key: 'share', header: 'Share' },
          ]}
          rows={tableRows}
        />
      )}
    </div>
  );
};
