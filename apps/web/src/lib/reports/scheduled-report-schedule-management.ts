// SPDX-License-Identifier: BUSL-1.1

import {
  buildScheduledReportRunPreview,
  type ScheduledReportConfig,
  type ScheduledReportRunPreview,
} from './scheduled-report-exports';

export type ReportScheduleStatus = 'active' | 'paused' | 'deleted';

export interface LocalReportSchedule extends ScheduledReportConfig {
  readonly status: ReportScheduleStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deliveryFailure?: {
    readonly failedAt: string;
    readonly message: string;
    readonly retryGuidance: string;
  };
}

export interface ScheduleManagementState {
  readonly schedules: readonly LocalReportSchedule[];
  readonly previews: readonly ScheduledReportRunPreview[];
  readonly failedDeliveryBanners: readonly string[];
  readonly backendDeliveryNotice: string | null;
}

export function createLocalReportSchedule(
  input: ScheduledReportConfig & { readonly now?: string },
): LocalReportSchedule {
  return {
    ...input,
    status: input.paused ? 'paused' : 'active',
    createdAt: input.now ?? new Date().toISOString(),
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

export function setLocalReportSchedulePaused(
  schedule: LocalReportSchedule,
  paused: boolean,
  now: string = new Date().toISOString(),
): LocalReportSchedule {
  return {
    ...schedule,
    paused,
    status: paused ? 'paused' : 'active',
    updatedAt: now,
  };
}

export function markLocalReportScheduleDeleted(
  schedule: LocalReportSchedule,
  now: string = new Date().toISOString(),
): LocalReportSchedule {
  return { ...schedule, status: 'deleted', paused: true, updatedAt: now };
}

export function recordLocalReportScheduleFailure(
  schedule: LocalReportSchedule,
  message: string,
  failedAt: string = new Date().toISOString(),
): LocalReportSchedule {
  return {
    ...schedule,
    deliveryFailure: {
      failedAt,
      message,
      retryGuidance:
        'Report export is saved locally. Email retry requires backend delivery infrastructure; review recipients and try again when delivery is available.',
    },
    updatedAt: failedAt,
  };
}

export function buildScheduleManagementState(
  schedules: readonly LocalReportSchedule[],
  asOfDate?: string,
): ScheduleManagementState {
  const activeSchedules = schedules.filter((schedule) => schedule.status !== 'deleted');
  const previews = activeSchedules.map((schedule) =>
    buildScheduledReportRunPreview(
      { ...schedule, paused: schedule.status === 'paused' || schedule.paused === true },
      asOfDate,
    ),
  );
  const hasEmailRecipients = activeSchedules.some((schedule) => (schedule.recipients?.length ?? 0) > 0);

  return {
    schedules: activeSchedules,
    previews,
    failedDeliveryBanners: activeSchedules
      .filter((schedule) => schedule.deliveryFailure !== undefined)
      .map((schedule) => `${schedule.reportName}: ${schedule.deliveryFailure?.message ?? 'Delivery failed'}`),
    backendDeliveryNotice: hasEmailRecipients
      ? 'Email delivery, backend scheduling, and retry execution are deferred; local schedule previews and controls are available.'
      : null,
  };
}
