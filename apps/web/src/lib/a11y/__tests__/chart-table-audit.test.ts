// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildChartA11yMetadata,
  buildChartAccessibleName,
  buildChartTextSummary,
  buildDataTableCaption,
  getSortableColumnA11yProps,
} from '../chart-table-audit';

describe('chart table accessibility helpers', () => {
  it('builds concise chart names and summaries with table fallback guidance', () => {
    const summary = buildChartTextSummary({
      title: 'Cash flow',
      timeframe: 'Last 4 months',
      trend: 'up',
      points: [
        { label: 'January', value: 100, comparison: 'up from December' },
        { label: 'February', value: 150 },
        { label: 'March', value: 125 },
        { label: 'April', value: 175 },
        { label: 'May', value: 180 },
      ],
      valueFormatter: (value) => `$${value}`,
    });

    expect(buildChartAccessibleName('Cash flow', 'Last 4 months')).toBe(
      'Cash flow, Last 4 months chart',
    );
    expect(summary).toContain('Trend is increasing.');
    expect(summary).toContain('January: $100, up from December');
    expect(summary).toContain('1 additional points are available in the data table.');
  });

  it('returns chart container props wired to a text description', () => {
    const metadata = buildChartA11yMetadata(
      {
        title: 'Net worth',
        timeframe: 'Year to date',
        trendDescription: 'Net worth rose steadily.',
        points: [{ label: 'June', value: 'positive' }],
      },
      'net-worth-summary',
    );

    expect(metadata.containerProps).toEqual({
      role: 'img',
      'aria-label': 'Net worth, Year to date chart',
      'aria-describedby': 'net-worth-summary',
    });
    expect(metadata.summary).toContain('Net worth rose steadily.');
  });

  it('describes table captions and sortable headers', () => {
    expect(
      buildDataTableCaption('Transactions table', 2, { columnId: 'date', direction: 'descending' }),
    ).toBe('Transactions table. 2 rows. Sorted by date descending.');

    expect(
      getSortableColumnA11yProps({
        columnId: 'date',
        label: 'Date',
        sort: { columnId: 'date', direction: 'descending' },
      }),
    ).toEqual({
      scope: 'col',
      'aria-sort': 'descending',
      'aria-label': 'Date. Sorted descending. Activate to reverse sort.',
    });
  });
});
