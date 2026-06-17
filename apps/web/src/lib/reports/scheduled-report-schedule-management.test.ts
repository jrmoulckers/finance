// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildScheduleManagementState,
  createLocalReportSchedule,
  markLocalReportScheduleDeleted,
  recordLocalReportScheduleFailure,
  setLocalReportSchedulePaused,
} from './scheduled-report-schedule-management';

describe('scheduled report schedule management', () => {
  const schedule = createLocalReportSchedule({
    id: 'sched-1',
    reportName: 'Monthly cash flow',
    frequency: 'monthly',
    anchorDate: '2026-01-31',
    exportFormats: ['csv'],
    recipients: ['owner@example.com'],
    now: '2026-01-01T00:00:00Z',
  });

  it('previews next runs and exposes backend delivery notice for email recipients', () => {
    const state = buildScheduleManagementState([schedule], '2026-02-01');

    expect(state.previews[0].nextRunDate).toBe('2026-02-28');
    expect(state.backendDeliveryNotice).toContain('deferred');
  });

  it('supports pause resume delete and failure banners locally', () => {
    const paused = setLocalReportSchedulePaused(schedule, true, '2026-01-02T00:00:00Z');
    const failed = recordLocalReportScheduleFailure(paused, 'Mailbox unavailable', '2026-01-03T00:00:00Z');
    const deleted = markLocalReportScheduleDeleted(schedule, '2026-01-04T00:00:00Z');
    const state = buildScheduleManagementState([failed, deleted], '2026-01-05');

    expect(paused.status).toBe('paused');
    expect(state.schedules).toHaveLength(1);
    expect(state.failedDeliveryBanners[0]).toContain('Mailbox unavailable');
    expect(state.previews[0].deliveryMode).toBe('paused');
  });
});
