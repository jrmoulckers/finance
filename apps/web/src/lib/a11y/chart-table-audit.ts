// SPDX-License-Identifier: BUSL-1.1

export type ChartTrend = 'up' | 'down' | 'flat' | 'mixed' | 'unknown';

export interface ChartSummaryPoint {
  label: string;
  value: number | string | null | undefined;
  series?: string;
  comparison?: string;
}

export interface ChartSummaryInput {
  title: string;
  timeframe: string;
  points: readonly ChartSummaryPoint[];
  trend?: ChartTrend;
  trendDescription?: string;
  valueFormatter?: (value: number | string) => string;
  maxPoints?: number;
}

export interface ChartA11yMetadata {
  accessibleName: string;
  summary: string;
  containerProps: {
    role: 'img';
    'aria-label': string;
    'aria-describedby'?: string;
  };
}

export interface SortState {
  columnId: string;
  direction: 'ascending' | 'descending';
}

export interface SortableColumnInput {
  columnId: string;
  label: string;
  sort?: SortState | null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatChartValue(
  value: ChartSummaryPoint['value'],
  valueFormatter?: (value: number | string) => string,
): string {
  if (value === null || value === undefined || value === '') {
    return 'no value';
  }

  return cleanText(valueFormatter ? valueFormatter(value) : String(value));
}

function describeTrend(input: ChartSummaryInput): string {
  if (input.trendDescription) {
    return cleanText(input.trendDescription);
  }

  switch (input.trend) {
    case 'up':
      return 'Trend is increasing.';
    case 'down':
      return 'Trend is decreasing.';
    case 'flat':
      return 'Trend is mostly flat.';
    case 'mixed':
      return 'Trend varies across the period.';
    default:
      return 'Trend is not available.';
  }
}

export function buildChartAccessibleName(title: string, timeframe: string): string {
  const cleanTitle = cleanText(title);
  const cleanTimeframe = cleanText(timeframe);
  return cleanTimeframe ? `${cleanTitle}, ${cleanTimeframe} chart` : `${cleanTitle} chart`;
}

export function buildChartTextSummary(input: ChartSummaryInput): string {
  const maxPoints = input.maxPoints ?? 4;
  const sampledPoints = input.points.slice(0, maxPoints);
  const pointSummary = sampledPoints
    .map((point) => {
      const series = point.series ? `${cleanText(point.series)} ` : '';
      const comparison = point.comparison ? `, ${cleanText(point.comparison)}` : '';
      return `${series}${cleanText(point.label)}: ${formatChartValue(point.value, input.valueFormatter)}${comparison}`;
    })
    .join('; ');

  const remainingCount = Math.max(input.points.length - sampledPoints.length, 0);
  const remaining =
    remainingCount > 0
      ? ` ${remainingCount} additional points are available in the data table.`
      : '';
  const points = pointSummary || 'No chart data is available.';

  return cleanText(
    `${input.title}. ${input.timeframe}. ${describeTrend(input)} Key values: ${points}.${remaining}`,
  );
}

export function buildChartA11yMetadata(
  input: ChartSummaryInput,
  descriptionId?: string,
): ChartA11yMetadata {
  const accessibleName = buildChartAccessibleName(input.title, input.timeframe);
  return {
    accessibleName,
    summary: buildChartTextSummary(input),
    containerProps: {
      role: 'img',
      'aria-label': accessibleName,
      ...(descriptionId ? { 'aria-describedby': descriptionId } : {}),
    },
  };
}

export function buildDataTableCaption(
  title: string,
  rowCount: number,
  sort?: SortState | null,
): string {
  const rowLabel = rowCount === 1 ? '1 row' : `${Math.max(rowCount, 0)} rows`;
  const sortLabel = sort ? ` Sorted by ${sort.columnId} ${sort.direction}.` : '';
  return cleanText(`${title}. ${rowLabel}.${sortLabel}`);
}

export function getSortableColumnA11yProps(input: SortableColumnInput): {
  scope: 'col';
  'aria-sort': 'none' | 'ascending' | 'descending';
  'aria-label': string;
} {
  const sort = input.sort;
  const isSorted = sort?.columnId === input.columnId;
  const ariaSort = isSorted && sort ? sort.direction : 'none';
  const action =
    isSorted && sort
      ? `Sorted ${sort.direction}. Activate to reverse sort.`
      : 'Not sorted. Activate to sort.';

  return {
    scope: 'col',
    'aria-sort': ariaSort,
    'aria-label': cleanText(`${input.label}. ${action}`),
  };
}
