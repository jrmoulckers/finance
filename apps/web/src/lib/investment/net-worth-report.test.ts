// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildNetWorthOverTimeReport, exportNetWorthTimelineCsv } from './net-worth-report';

const snapshots = [
  {
    date: '2025-01-10',
    assetsCents: 100_000_00,
    liabilitiesCents: 60_000_00,
    accountClassValues: [
      { className: 'Investments', amountCents: 50_000_00 },
      { className: 'Loans', amountCents: 60_000_00 },
    ],
  },
  {
    date: '2025-02-10',
    assetsCents: 110_000_00,
    liabilitiesCents: 55_000_00,
    accountClassValues: [
      { className: 'Investments', amountCents: 60_000_00 },
      { className: 'Loans', amountCents: 55_000_00 },
    ],
  },
  {
    date: '2025-03-10',
    assetsCents: 125_000_00,
    liabilitiesCents: 0,
    accountClassValues: [
      { className: 'Investments', amountCents: 70_000_00 },
      { className: 'Loans', amountCents: 0 },
    ],
  },
];

describe('buildNetWorthOverTimeReport', () => {
  it('builds monthly points, comparison, milestones, and contribution changes', () => {
    const report = buildNetWorthOverTimeReport(snapshots, 'ALL');

    expect(report.points).toHaveLength(3);
    expect(report.points[0]?.netWorthCents).toBe(40_000_00);
    expect(report.comparison?.changeCents).toBe(85_000_00);
    expect(report.milestones.find((milestone) => milestone.id === 'debt-free')?.reachedMonth).toBe(
      '2025-03',
    );
    expect(report.contributionChanges[0]?.className).toBe('Loans');
    expect(report.csv).toContain('month,assetsCents,liabilitiesCents,netWorthCents');
  });

  it('filters to year-to-date relative to the latest snapshot', () => {
    const report = buildNetWorthOverTimeReport(
      [{ date: '2024-12-31', assetsCents: 1, liabilitiesCents: 0 }, ...snapshots],
      'YTD',
    );

    expect(report.points[0]?.month).toBe('2025-01');
  });
});

describe('exportNetWorthTimelineCsv', () => {
  it('exports accessible report rows', () => {
    expect(
      exportNetWorthTimelineCsv([
        { month: '2025-01', assetsCents: 100, liabilitiesCents: 25, netWorthCents: 75 },
      ]),
    ).toBe('month,assetsCents,liabilitiesCents,netWorthCents\n2025-01,100,25,75');
  });
});
