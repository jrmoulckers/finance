// SPDX-License-Identifier: BUSL-1.1

/**
 * CategoryPieChart — custom D3.js pie chart for category breakdowns.
 *
 * Renders a pie chart with a responsive legend (side on desktop, below on
 * mobile) instead of inline text labels which overlap with many categories.
 *
 * @module components/charts/CategoryPieChart
 */
import { type FC, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  CHART_COLORS,
  buildCategoryCaption,
  buildChartDescription,
  formatChartCurrency,
  patternId,
} from './chart-palette';
import { AccessibleChartDataTable } from './chart-accessibility';
import { ChartEmptyState } from './ChartEmptyState';
import { useEffectiveMaskingMode } from '../../contexts/PrivacyModeContext';

export interface CategorySlice {
  name: string;
  value: number;
}
export interface CategoryPieChartProps {
  data: CategorySlice[];
  currency?: string;
  width?: number;
  height?: number;
  title?: string;
}

/** Side length (user units) of a single texture tile. */
const PATTERN_TILE = 8;

/**
 * SVG texture shapes for a given palette index, cycling through six distinct
 * patterns (dots, diagonals, orthogonals, crosshatch). Layered over the slice's
 * CVD-safe color they provide a secondary, color-independent encoding so
 * adjacent slices remain distinguishable for low-vision / color-blind users
 * (WCAG 1.4.1 Use of Color). Stroke uses a token so it adapts to light/dark.
 */
function TextureShapes({ index }: { index: number }): React.ReactElement {
  const stroke = 'var(--semantic-background-primary, #FFFFFF)';
  const strokeWidth = 1.3;
  switch (index % 6) {
    case 0:
      return <circle cx={PATTERN_TILE / 2} cy={PATTERN_TILE / 2} r={1.4} fill={stroke} />;
    case 1:
      return (
        <path
          d={`M0 ${PATTERN_TILE} L${PATTERN_TILE} 0`}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case 2:
      return (
        <path
          d={`M0 0 L${PATTERN_TILE} ${PATTERN_TILE}`}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case 3:
      return (
        <path
          d={`M0 ${PATTERN_TILE / 2} L${PATTERN_TILE} ${PATTERN_TILE / 2}`}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case 4:
      return (
        <path
          d={`M${PATTERN_TILE / 2} 0 L${PATTERN_TILE / 2} ${PATTERN_TILE}`}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    default:
      return (
        <>
          <path
            d={`M0 0 L${PATTERN_TILE} ${PATTERN_TILE}`}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <path
            d={`M0 ${PATTERN_TILE} L${PATTERN_TILE} 0`}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </>
      );
  }
}

export const CategoryPieChart: FC<CategoryPieChartProps> = ({
  data,
  currency = 'USD',
  width = 320,
  height = 320,
  title = 'Spending by category',
}) => {
  const chartId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');
  const maskingMode = useEffectiveMaskingMode();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const description = buildChartDescription(
    'Pie chart',
    data.map((d) => ({ label: d.name, value: d.value })),
    currency,
    maskingMode,
  );
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const caption = useMemo(
    () =>
      buildCategoryCaption(
        data.map((d) => ({ name: d.name, value: d.value })),
        currency,
        maskingMode,
      ),
    [data, currency, maskingMode],
  );
  const formattedTotal = formatChartCurrency(total, currency, 'en-US', maskingMode);
  // useId() can contain colons; strip them so the derived <pattern> ids are safe
  // to reference from `fill: url(#…)`.
  const patternPrefix = chartId.replace(/:/g, '');
  const patternRef = useCallback(
    (index: number) => `${patternPrefix}-${patternId(index)}`,
    [patternPrefix],
  );

  const renderChart = useCallback(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const margin = 16;
    const radius = Math.min(width, height) / 2 - margin;
    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`)
      .attr('role', 'list')
      .attr('aria-label', 'Chart segments');
    const pie = d3
      .pie<CategorySlice>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.02);
    const arc = d3
      .arc<d3.PieArcDatum<CategorySlice>>()
      .innerRadius(radius * 0.58)
      .outerRadius(radius);
    const slices = g
      .selectAll<SVGPathElement, d3.PieArcDatum<CategorySlice>>('path')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('role', 'listitem')
      .attr('tabindex', (_d, i) => (i === 0 ? '0' : '-1'))
      .attr('data-chart-point', '')
      .attr(
        'aria-label',
        (d) =>
          `${d.data.name}: ${formatChartCurrency(d.data.value, currency, 'en-US', maskingMode)} (${total > 0 ? ((d.data.value / total) * 100).toFixed(1) : '0.0'}%)`,
      )
      .attr('fill', (_d, i) => `url(#${patternRef(i)})`)
      .attr('stroke', 'var(--semantic-background-primary, #FFFFFF)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('outline', 'none');
    slices
      .on('focus', function () {
        setAnnouncement(this.getAttribute('aria-label') ?? '');
        d3.select(this)
          .attr('stroke', 'var(--semantic-border-focus, #3B82F6)')
          .attr('stroke-width', 3);
      })
      .on('blur', function () {
        d3.select(this)
          .attr('stroke', 'var(--semantic-background-primary, #FFFFFF)')
          .attr('stroke-width', 2);
      });
    if (reducedMotion) {
      slices.attr('d', arc);
    } else {
      slices
        .transition()
        .duration(600)
        .attrTween('d', (d) => {
          const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
          return (t: number) => arc(i(t)) ?? '';
        });
    }
  }, [data, currency, width, height, reducedMotion, total, maskingMode, patternRef]);

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!svgRef.current) return;
    const chartSlices = Array.from(
      svgRef.current.querySelectorAll<SVGPathElement>('[data-chart-point]'),
    );
    if (chartSlices.length === 0) return;
    const cur = chartSlices.findIndex((s) => s === document.activeElement);
    let next = cur;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % chartSlices.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (cur - 1 + chartSlices.length) % chartSlices.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = chartSlices.length - 1;
    else return;
    e.preventDefault();
    chartSlices.forEach((s, i) => {
      s.setAttribute('tabindex', i === next ? '0' : '-1');
    });
    chartSlices[next].focus();
  }, []);

  const tableRows = data.map((slice, i) => {
    const percent = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
    const formattedValue = formatChartCurrency(slice.value, currency, 'en-US', maskingMode);
    return {
      id: `${chartId}-row-${i}`,
      rowHeader: slice.name,
      cells: [formattedValue, `${percent}%`],
      ariaLabel: `${slice.name}: ${formattedValue} (${percent}%)`,
    };
  });

  if (data.length === 0) {
    return <ChartEmptyState title={title} titleId={`${chartId}-title`} />;
  }

  return (
    <div ref={containerRef} role="figure" aria-label={description} aria-roledescription="pie chart">
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
      <div className="pie-chart-layout">
        <div className="pie-chart-canvas">
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={`${chartId}-title`}
            aria-describedby={`${chartId}-desc`}
            onKeyDown={handleKeyDown}
          />
          {total > 0 && (
            <div className="pie-chart-center" aria-hidden="true">
              <span className="pie-chart-center__value">{formattedTotal}</span>
              <span className="pie-chart-center__label">Total</span>
            </div>
          )}
        </div>
        <ul className="pie-chart-legend" aria-label="Category legend">
          {data.map((slice, i) => {
            const percent = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
            return (
              <li key={slice.name} className="pie-chart-legend__item">
                <svg
                  className="pie-chart-legend__swatch"
                  width={12}
                  height={12}
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect width={12} height={12} rx={2} fill={`url(#${patternRef(i)})`} />
                </svg>
                <span className="pie-chart-legend__name">{slice.name}</span>
                <span className="pie-chart-legend__value">
                  {formatChartCurrency(slice.value, currency, 'en-US', maskingMode)} ({percent}%)
                </span>
              </li>
            );
          })}
        </ul>
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
      {/* Shared, off-screen texture definitions referenced by both the pie
          slices (via D3 `fill: url(#…)`) and the legend swatches, so the legend
          maps 1:1 to slices even for low-vision / color-blind users. Rendered
          last so the primary chart svg remains the first <svg> in the tree. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="pie-chart-defs">
        <defs>
          {data.map((_slice, i) => (
            <pattern
              key={patternRef(i)}
              id={patternRef(i)}
              patternUnits="userSpaceOnUse"
              width={PATTERN_TILE}
              height={PATTERN_TILE}
            >
              <rect
                width={PATTERN_TILE}
                height={PATTERN_TILE}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
              />
              <TextureShapes index={i} />
            </pattern>
          ))}
        </defs>
      </svg>
    </div>
  );
};
