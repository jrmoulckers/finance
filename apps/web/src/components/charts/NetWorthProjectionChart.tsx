// SPDX-License-Identifier: BUSL-1.1

/**
 * NetWorthProjectionChart — net worth growth line with a forward projection
 * overlay derived from the recent contribution pace.
 *
 * Imported directly by NetWorthPage (a lazy route) and intentionally kept out
 * of the charts barrel so it never lands in eagerly-imported chunks. Reuses the
 * existing recharts dependency (no new charting library) and the shared chart
 * accessibility + palette helpers.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Actual vs projected are distinguished by line pattern (solid vs dashed) and
 *   an explicit legend + data-table "Type" column — never by color alone.
 * - Range control is a keyboard-operable button group with `aria-pressed`.
 * - A visually-hidden, keyboard-navigable data table mirrors every point.
 * - Animation is disabled under `prefers-reduced-motion`.
 *
 * References: issue #2116
 */

import { type FC, useId, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, formatChartCurrency } from './chart-palette';
import {
  AccessibleChartDataTable,
  CHART_KEYBOARD_INSTRUCTIONS,
  useChartKeyboardNavigation,
} from './chart-accessibility';
import { useEffectiveMaskingMode } from '../../contexts/PrivacyModeContext';
import {
  PROJECTION_RANGES,
  projectNetWorth,
  rangeToHorizonMonths,
  sliceSeriesToRange,
  type NetWorthSeriesPoint,
  type ProjectionRange,
} from '../../lib/visualization/net-worth-projection';
import './net-worth-projection.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NetWorthProjectionChartProps {
  /** Trailing monthly net-worth history, oldest first. Amounts in cents. */
  history: readonly NetWorthSeriesPoint[];
  /** ISO 4217 currency code for formatting. */
  currency?: string;
  /** Chart height in pixels. */
  height?: number;
  /** Chart title. */
  title?: string;
  /** Default selected range. */
  defaultRange?: ProjectionRange;
}

interface CombinedRow {
  readonly label: string;
  readonly actual: number | null;
  readonly projected: number | null;
}

const ACTUAL_COLOR = CHART_COLORS[0];
const PROJECTED_COLOR = CHART_COLORS[1];
const PROJECTED_DASH = '6 5';

const RANGE_DESCRIPTIONS: Record<ProjectionRange, string> = {
  '3M': 'Show the last 3 months and a 3-month projection',
  '6M': 'Show the last 6 months and a 6-month projection',
  '1Y': 'Show the last 12 months and a 12-month projection',
  All: 'Show all history and a derived projection',
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function centsToMajor(cents: number): number {
  return cents / 100;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RangeSelectorProps {
  selected: ProjectionRange;
  onChange: (range: ProjectionRange) => void;
}

const RangeSelector: FC<RangeSelectorProps> = ({ selected, onChange }) => (
  <div className="nw-projection__range" role="group" aria-label="Projection range">
    {PROJECTION_RANGES.map((range) => (
      <button
        key={range}
        type="button"
        className={`nw-projection__range-btn${
          selected === range ? ' nw-projection__range-btn--active' : ''
        }`}
        onClick={() => onChange(range)}
        aria-pressed={selected === range}
        aria-label={RANGE_DESCRIPTIONS[range]}
      >
        {range}
      </button>
    ))}
  </div>
);

/** Pattern-based legend so actual/projected are not conveyed by color alone. */
const ProjectionLegend: FC = () => (
  <ul className="nw-projection__legend" aria-label="Chart legend">
    <li className="nw-projection__legend-item">
      <svg
        className="nw-projection__legend-swatch"
        width="28"
        height="10"
        viewBox="0 0 28 10"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="0" y1="5" x2="28" y2="5" stroke={ACTUAL_COLOR} strokeWidth="3" />
      </svg>
      <span>Actual net worth (solid line)</span>
    </li>
    <li className="nw-projection__legend-item">
      <svg
        className="nw-projection__legend-swatch"
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
          stroke={PROJECTED_COLOR}
          strokeWidth="3"
          strokeDasharray={PROJECTED_DASH}
        />
      </svg>
      <span>Projected forecast (dashed line)</span>
    </li>
  </ul>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const NetWorthProjectionChart: FC<NetWorthProjectionChartProps> = ({
  history,
  currency = 'USD',
  height = 320,
  title = 'Net Worth Growth & Projection',
  defaultRange = '6M',
}) => {
  const chartId = useId();
  const disableAnimation = prefersReducedMotion();
  const maskingMode = useEffectiveMaskingMode();
  const [range, setRange] = useState<ProjectionRange>(defaultRange);

  const visible = useMemo(() => sliceSeriesToRange(history, range), [history, range]);

  const projection = useMemo(() => {
    const horizonMonths = rangeToHorizonMonths(range, visible.length);
    return projectNetWorth(visible, { horizonMonths, method: 'regression' });
  }, [visible, range]);

  const boundaryLabel = visible.length > 0 ? visible[visible.length - 1]!.label : null;

  const chartData = useMemo<CombinedRow[]>(() => {
    const actualRows: CombinedRow[] = visible.map((point, index) => ({
      label: point.label,
      actual: centsToMajor(point.netWorthCents),
      // Repeat the last actual value on the projected series so the dashed
      // line connects seamlessly to the solid line.
      projected:
        index === visible.length - 1 && projection.hasProjection
          ? centsToMajor(point.netWorthCents)
          : null,
    }));
    const projectedRows: CombinedRow[] = projection.points.map((point) => ({
      label: point.label,
      actual: null,
      projected: centsToMajor(point.netWorthCents),
    }));
    return [...actualRows, ...projectedRows];
  }, [visible, projection]);

  // Only pin the axis to $0 and draw the break-even line when the series is
  // (or is projected to be) underwater; forcing a purely-positive chart to
  // include zero would waste vertical resolution.
  const crossesZero = useMemo(
    () =>
      chartData.some(
        (row) =>
          (row.actual !== null && row.actual < 0) || (row.projected !== null && row.projected < 0),
      ),
    [chartData],
  );

  const description = useMemo(() => {
    if (visible.length === 0) return `${title}: no net worth history yet.`;
    const values = visible.map((point) => point.netWorthCents);
    const min = formatChartCurrency(
      centsToMajor(Math.min(...values)),
      currency,
      'en-US',
      maskingMode,
    );
    const max = formatChartCurrency(
      centsToMajor(Math.max(...values)),
      currency,
      'en-US',
      maskingMode,
    );
    const projectedNote = projection.hasProjection
      ? ` Projected ${projection.horizonMonths} months forward to ${formatChartCurrency(
          centsToMajor(projection.endNetWorthCents),
          currency,
          'en-US',
          maskingMode,
        )}.`
      : ' No projection is shown for this range yet.';
    return `${title}: ${visible.length} actual points ranging ${min} to ${max}.${projectedNote}`;
  }, [visible, projection, currency, title, maskingMode]);

  const paceText = useMemo(() => {
    const magnitude = formatChartCurrency(
      centsToMajor(Math.abs(projection.monthlyPaceCents)),
      currency,
      'en-US',
      maskingMode,
    );
    const direction =
      projection.paceDirection === 'up'
        ? 'growth'
        : projection.paceDirection === 'down'
          ? 'decline'
          : 'change';
    return `${magnitude}/month ${direction}`;
  }, [projection, currency, maskingMode]);

  const assumptionsText = projection.hasProjection
    ? `Forecast assumes a steady ${paceText} (${projection.methodSummary}), projected ${projection.horizonMonths} months ahead. Estimate only. Not financial advice.`
    : projection.reason;

  const dataPointRows = useMemo(() => {
    const actualRows = visible.map((point, index) => {
      const formattedValue = formatChartCurrency(
        centsToMajor(point.netWorthCents),
        currency,
        'en-US',
        maskingMode,
      );
      return {
        id: `${chartId}-actual-${index}`,
        rowHeader: point.label,
        cells: ['Actual', formattedValue],
        ariaLabel: `${point.label}: actual net worth ${formattedValue}`,
      };
    });
    const projectedRows = projection.points.map((point, index) => {
      const formattedValue = formatChartCurrency(
        centsToMajor(point.netWorthCents),
        currency,
        'en-US',
        maskingMode,
      );
      return {
        id: `${chartId}-projected-${index}`,
        rowHeader: point.label,
        cells: ['Projected', formattedValue],
        ariaLabel: `${point.label}: projected net worth ${formattedValue}`,
      };
    });
    return [...actualRows, ...projectedRows];
  }, [visible, projection, currency, chartId, maskingMode]);

  const { announcement, handleFocus, handleKeyDown } = useChartKeyboardNavigation(dataPointRows);

  return (
    <div
      className="nw-projection"
      role="figure"
      aria-label={description}
      aria-roledescription="net worth projection chart"
    >
      <div className="nw-projection__header">
        <h3 id={`${chartId}-title`} className="chart-title">
          {title}
        </h3>
        <RangeSelector selected={range} onChange={setRange} />
      </div>

      <p id={`${chartId}-desc`} className="sr-only">
        {description}
      </p>
      <p id={`${chartId}-instructions`} className="sr-only">
        {CHART_KEYBOARD_INSTRUCTIONS}
      </p>

      {visible.length === 0 ? (
        <p className="nw-projection__empty" role="status">
          Add account balances and transactions to see your net worth grow over time.
        </p>
      ) : (
        <>
          <ProjectionLegend />

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
                data={chartData}
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
                  tickFormatter={(value: number) =>
                    formatChartCurrency(value, currency, 'en-US', maskingMode)
                  }
                  tick={{ fill: 'var(--semantic-text-secondary, #6B7280)', fontSize: 12 }}
                  width={80}
                  domain={
                    crossesZero
                      ? [(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]
                      : ['auto', 'auto']
                  }
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
                {projection.hasProjection && boundaryLabel !== null && (
                  <ReferenceLine
                    x={boundaryLabel}
                    stroke="var(--semantic-text-secondary, #6B7280)"
                    strokeDasharray="2 4"
                    label={{
                      value: 'Now',
                      position: 'top',
                      fill: 'var(--semantic-text-secondary, #6B7280)',
                      fontSize: 11,
                    }}
                  />
                )}
                {crossesZero && (
                  <ReferenceLine
                    y={0}
                    stroke="var(--semantic-text-secondary, #6B7280)"
                    strokeDasharray="4 2"
                    label={{
                      value: 'Break-even ($0)',
                      position: 'insideTopLeft',
                      fill: 'var(--semantic-text-secondary, #6B7280)',
                      fontSize: 11,
                    }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual"
                  stroke={ACTUAL_COLOR}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                  connectNulls={false}
                  isAnimationActive={!disableAnimation}
                  animationDuration={600}
                />
                <Line
                  type="monotone"
                  dataKey="projected"
                  name="Projected"
                  stroke={PROJECTED_COLOR}
                  strokeWidth={2}
                  strokeDasharray={PROJECTED_DASH}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                  isAnimationActive={!disableAnimation}
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {assumptionsText && (
            <p className="nw-projection__assumptions" aria-live="polite">
              {assumptionsText}
            </p>
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
            columns={[
              { key: 'type', header: 'Type' },
              { key: 'netWorth', header: 'Net worth' },
            ]}
            rows={dataPointRows}
          />
        </>
      )}
    </div>
  );
};

export default NetWorthProjectionChart;
