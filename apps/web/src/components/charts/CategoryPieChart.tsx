// SPDX-License-Identifier: BUSL-1.1

/**
 * CategoryPieChart — custom D3.js pie chart for category breakdowns.
 * @module components/charts/CategoryPieChart
 */
import { type FC, useCallback, useEffect, useId, useRef } from 'react';
import * as d3 from 'd3';
import { CHART_COLORS, buildChartDescription, formatChartCurrency } from './chart-palette';

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
  const description = buildChartDescription(
    'Pie chart',
    data.map((d) => ({ label: d.name, value: d.value })),
    currency,
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
    const total = data.reduce((sum, d) => sum + d.value, 0);
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
          `${d.data.name}: ${formatChartCurrency(d.data.value, currency)} (${((d.data.value / total) * 100).toFixed(1)}%)`,
      )
      .attr('fill', (_d, i) => CHART_COLORS[i % CHART_COLORS.length])
      .attr('stroke', 'var(--color-background-primary, #FFFFFF)')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('outline', 'none');
    slices
      .on('focus', function () {
        d3.select(this)
          .attr('stroke', 'var(--color-border-focus, #3B82F6)')
          .attr('stroke-width', 3);
      })
      .on('blur', function () {
        d3.select(this)
          .attr('stroke', 'var(--color-background-primary, #FFFFFF)')
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
    const labelArc = d3
      .arc<d3.PieArcDatum<CategorySlice>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.6);
    g.selectAll<SVGTextElement, d3.PieArcDatum<CategorySlice>>('text')
      .data(pie(data))
      .enter()
      .append('text')
      .attr('transform', (d) => `translate(${labelArc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', 'var(--color-text-primary, #111827)')
      .attr('font-size', '11px')
      .attr('font-weight', '500')
      .attr('aria-hidden', 'true')
      .text((d) => (d.data.value / total > 0.05 ? d.data.name : ''));
  }, [data, currency, width, height, reducedMotion]);

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
    </div>
  );
};
