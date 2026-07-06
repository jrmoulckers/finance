// SPDX-License-Identifier: BUSL-1.1

/**
 * BudgetDonutChart — Recharts donut chart for budget allocation.
 * @module components/charts/BudgetDonutChart
 */
import { type FC, useCallback, useId, useMemo, useRef, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts';
import { CHART_COLORS, buildChartDescription, formatChartCurrency } from './chart-palette';
import { AccessibleChartDataTable } from './chart-accessibility';
import { useArrowKeyNavigation } from '../../accessibility/aria';

export interface BudgetSlice {
  name: string;
  value: number;
}
export interface BudgetDonutChartProps {
  data: BudgetSlice[];
  currency?: string;
  height?: number;
  title?: string;
  centerLabel?: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const BudgetDonutChart: FC<BudgetDonutChartProps> = ({
  data,
  currency = 'USD',
  height = 320,
  title = 'Budget breakdown',
  centerLabel,
}) => {
  const chartId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const disableAnimation = prefersReducedMotion();
  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);
  const description = useMemo(
    () =>
      buildChartDescription(
        'Donut chart',
        data.map((d) => ({ label: d.name, value: d.value })),
        currency,
      ),
    [data, currency],
  );
  const pointAnnouncements = useMemo(
    () =>
      data.map(
        (entry, index) =>
          `${title}. Focused slice ${index + 1} of ${data.length}. ${entry.name}: ${formatChartCurrency(entry.value, currency)} (${total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0'}%).`,
      ),
    [currency, data, title, total],
  );
  const { handleKeyDown } = useArrowKeyNavigation(containerRef, {
    orientation: 'both',
    onFocus: useCallback(
      (index: number) => setAnnouncement(pointAnnouncements[index] ?? ''),
      [pointAnnouncements],
    ),
  });

  const tableRows = useMemo(
    () =>
      data.map((entry, index) => {
        const percent = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0';
        const formattedValue = formatChartCurrency(entry.value, currency);
        return {
          id: `${chartId}-row-${index}`,
          rowHeader: entry.name,
          cells: [formattedValue, `${percent}%`],
          ariaLabel: `${entry.name}: ${formattedValue} (${percent}%)`,
        };
      }),
    [chartId, currency, data, total],
  );

  return (
    <div
      ref={containerRef}
      role="figure"
      aria-label={description}
      aria-roledescription="donut chart"
      onKeyDown={handleKeyDown}
    >
      <h3 id={`${chartId}-title`} className="chart-title">
        {title}
      </h3>
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
      <ResponsiveContainer width="100%" height={height}>
        <PieChart
          role="img"
          aria-labelledby={`${chartId}-title`}
          aria-describedby={`${chartId}-desc`}
        >
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            isAnimationActive={!disableAnimation}
            animationDuration={600}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                data-chart-point=""
                tabIndex={-1}
                role="listitem"
                aria-label={`${entry.name}: ${formatChartCurrency(entry.value, currency)} (${((entry.value / total) * 100).toFixed(1)}%)`}
              />
            ))}
            <Label
              value={centerLabel ?? formatChartCurrency(total, currency)}
              position="center"
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                fill: 'var(--semantic-text-primary, #111827)',
              }}
            />
          </Pie>
          <Tooltip
            formatter={(value, name) => [
              formatChartCurrency(Number(value ?? 0), currency),
              String(name),
            ]}
            contentStyle={{
              background: 'var(--semantic-background-elevated, #FFFFFF)',
              border: '1px solid var(--semantic-border-default, #E5E7EB)',
              borderRadius: '0.375rem',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
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
