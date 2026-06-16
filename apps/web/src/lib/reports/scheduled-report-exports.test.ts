// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildReportCsv,
  buildScheduledReportExportPackage,
  buildScheduledReportRunPreview,
  calculateNextScheduledRun,
  type ScheduledReportConfig,
} from './scheduled-report-exports';

const schedule: ScheduledReportConfig = {
  id: 'report-1',
  reportName: 'Monthly CFO Summary',
  frequency: 'monthly',
  anchorDate: '2025-01-31',
  exportFormats: ['csv', 'html'],
  recipients: ['owner@example.com'],
};

describe('scheduled report exports', () => {
  it('calculates a clamped next monthly run date', () => {
    expect(calculateNextScheduledRun(schedule, '2025-02-01')).toBe('2025-02-28');
    expect(
      calculateNextScheduledRun({ ...schedule, lastRunDate: '2025-02-28' }, '2025-03-01'),
    ).toBe('2025-03-31');
  });

  it('returns no next run for paused schedules', () => {
    const preview = buildScheduledReportRunPreview({ ...schedule, paused: true }, '2025-02-01');

    expect(preview.nextRunDate).toBeNull();
    expect(preview.deliveryMode).toBe('paused');
  });

  it('builds CSV exports with safe escaping', () => {
    const csv = buildReportCsv({
      headers: ['Name', 'Amount'],
      rows: [{ Name: 'Food, groceries', Amount: 1234 }],
    });

    expect(csv).toBe('Name,Amount\n"Food, groceries",1234');
  });

  it('packages local CSV and HTML while marking backend email delivery deferred', () => {
    const result = buildScheduledReportExportPackage(
      schedule,
      {
        headers: ['Metric', 'Value'],
        rows: [{ Metric: 'Net cash flow', Value: 45000 }],
        summary: { Rows: 1 },
      },
      '2025-02-10T12:00:00.000Z',
      '2025-02-10',
    );

    expect(result.csvAttachment?.filename).toBe('monthly-cfo-summary-2025-02-10.csv');
    expect(result.htmlSummary).toContain('Monthly CFO Summary');
    expect(result.metadata).toMatchObject({
      rowCount: 1,
      containsSensitiveUrlData: false,
      emailDeliveryDeferred: true,
    });
  });
});
