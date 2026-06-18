// SPDX-License-Identifier: BUSL-1.1

/**
 * CategoryPieChart — custom D3.js pie chart for category breakdowns.
 *
 * Renders a pie chart with a responsive legend (side on desktop, below on
 * mobile) instead of inline text labels which overlap with many categories.
 *
 * @module components/charts/CategoryPieChart
 */
import { type FC, useCallback, useEffect, useId, useRef, useState } from 'react';
import * as d3 from 'd3';
import { CHART_COLORS, buildChartDescription, formatChartCurrency } from './chart-palette';
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
    const arc = d3.arc<d3.PieArcDatum<CategorySlice>>().innerRadius(0).outerRadius(radius);
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
          `${d.data.name}: ${formatChartCurrency(d.data.value, currency, 'en-US', maskingMode)} (${((d.data.value / total) * 100).toFixed(1)}%)`,
      )
      .attr('fill', (_d, i) => CHART_COLORS[i % CHART_COLORS.length])
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
  }, [data, currency, width, height, reducedMotion, total, maskingMode]);

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

  return (
    <div ref={containerRef} role="figure" aria-label={description} aria-roledescription="pie chart">
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
      <div className="pie-chart-layout">
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
        <ul className="pie-chart-legend" aria-label="Category legend">
          {data.map((slice, i) => {
            const percent = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
            return (
              <li key={slice.name} className="pie-chart-legend__item">
                <span
                  className="pie-chart-legend__swatch"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  aria-hidden="true"
                />
                <span className="pie-chart-legend__name">{slice.name}</span>
                <span className="pie-chart-legend__value">
                  {formatChartCurrency(slice.value, currency, 'en-US', maskingMode)} ({percent}%)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
