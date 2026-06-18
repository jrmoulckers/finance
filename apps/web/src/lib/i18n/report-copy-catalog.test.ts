// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { listMissingReportCopyIds, resolveReportCopy } from './report-copy-catalog';

describe('report copy catalog', () => {
  it('falls back to default chart labels when a translation is missing', () => {
    const resolved = resolveReportCopy({
      id: 'charts.spendingTrend.aria',
      catalog: {},
      values: { dateRange: 'January' },
    });

    expect(resolved.text).toBe('Spending trend chart for January');
    expect(resolved.translated).toBe(false);
    expect(resolved.translatorNote).toContain('{dateRange}');
  });

  it('reports missing ids while preserving formatted placeholders', () => {
    const catalog = { 'charts.category.tooltip': 'Categoría {categoryName}: {value}' } as const;
    expect(
      resolveReportCopy({
        id: 'charts.category.tooltip',
        catalog,
        values: { categoryName: 'Food', value: '$10.00' },
      }).text,
    ).toBe('Categoría Food: $10.00');
    expect(listMissingReportCopyIds(catalog)).toContain('reports.monthly.heading');
  });
});
