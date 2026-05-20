// SPDX-License-Identifier: BUSL-1.1

/**
 * Automated allowance transfer engine.
 *
 * Pure functions for managing recurring allowance schedules,
 * auto-transfer simulation, bonus allowances, and pause/resume.
 * All monetary values in integer cents.
 *
 * References: #1797
 */

import type { AllowanceSchedule, AllowanceTransfer, RecurrenceFrequency } from './types';

// ---------------------------------------------------------------------------
// Schedule management
// ---------------------------------------------------------------------------

/**
 * Creates a new allowance schedule.
 *
 * @param params - Schedule creation parameters
 * @returns A new AllowanceSchedule
 * @throws If amountCents is not positive or dayOfPeriod is out of range
 */
export function createAllowanceSchedule(params: {
  readonly id: string;
  readonly accountId: string;
  readonly recipientName: string;
  readonly amountCents: number;
  readonly frequency: RecurrenceFrequency;
  readonly dayOfPeriod: number;
  readonly startDate: string;
}): AllowanceSchedule {
  if (params.amountCents <= 0) {
    throw new RangeError('Allowance amount must be positive');
  }
  if (params.frequency === 'monthly' && (params.dayOfPeriod < 1 || params.dayOfPeriod > 28)) {
    throw new RangeError('Day of month must be between 1 and 28');
  }
  if (
    (params.frequency === 'weekly' || params.frequency === 'biweekly') &&
    (params.dayOfPeriod < 1 || params.dayOfPeriod > 7)
  ) {
    throw new RangeError('Day of week must be between 1 and 7');
  }

  return {
    id: params.id,
    accountId: params.accountId,
    recipientName: params.recipientName,
    amountCents: params.amountCents,
    frequency: params.frequency,
    dayOfPeriod: params.dayOfPeriod,
    active: true,
    nextTransferDate: params.startDate,
    createdAt: params.startDate,
  };
}

/**
 * Pauses an active allowance schedule.
 *
 * @param schedule - The schedule to pause
 * @returns Updated schedule with active=false
 */
export function pauseSchedule(schedule: AllowanceSchedule): AllowanceSchedule {
  return { ...schedule, active: false };
}

/**
 * Resumes a paused allowance schedule.
 *
 * @param schedule - The schedule to resume
 * @param nextDate - The next transfer date after resuming (ISO-8601)
 * @returns Updated schedule with active=true
 */
export function resumeSchedule(schedule: AllowanceSchedule, nextDate: string): AllowanceSchedule {
  return { ...schedule, active: true, nextTransferDate: nextDate };
}

/**
 * Updates the allowance amount.
 *
 * @param schedule - The existing schedule
 * @param newAmountCents - New amount in cents
 * @returns Updated schedule
 * @throws If newAmountCents is not positive
 */
export function updateAllowanceAmount(
  schedule: AllowanceSchedule,
  newAmountCents: number,
): AllowanceSchedule {
  if (newAmountCents <= 0) {
    throw new RangeError('Allowance amount must be positive');
  }
  return { ...schedule, amountCents: newAmountCents };
}

// ---------------------------------------------------------------------------
// Transfer simulation
// ---------------------------------------------------------------------------

/**
 * Calculates the next transfer date based on the frequency.
 *
 * @param currentDate - Current transfer date (ISO-8601)
 * @param frequency - Recurrence frequency
 * @returns ISO-8601 date string for the next transfer
 */
export function calculateNextTransferDate(
  currentDate: string,
  frequency: RecurrenceFrequency,
): string {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
  }
  return date.toISOString();
}

/**
 * Simulates executing a scheduled allowance transfer.
 *
 * Returns the transfer record and an updated schedule with the next
 * transfer date. Does NOT mutate any state.
 *
 * @param schedule - The active schedule
 * @param transferId - ID for the new transfer
 * @param now - Current ISO-8601 timestamp
 * @returns Object with the transfer record and updated schedule
 * @throws If the schedule is not active
 */
export function simulateTransfer(
  schedule: AllowanceSchedule,
  transferId: string,
  now: string,
): { readonly transfer: AllowanceTransfer; readonly updatedSchedule: AllowanceSchedule } {
  if (!schedule.active) {
    throw new Error(`Schedule ${schedule.id} is not active`);
  }

  const transfer: AllowanceTransfer = {
    id: transferId,
    scheduleId: schedule.id,
    amountCents: schedule.amountCents,
    type: 'regular',
    note: `Scheduled allowance for ${schedule.recipientName}`,
    transferredAt: now,
  };

  const updatedSchedule: AllowanceSchedule = {
    ...schedule,
    nextTransferDate: calculateNextTransferDate(now, schedule.frequency),
  };

  return { transfer, updatedSchedule };
}

/**
 * Creates a bonus allowance transfer (e.g. birthday, holiday).
 *
 * @param params - Bonus transfer parameters
 * @returns A new AllowanceTransfer of type 'bonus'
 */
export function createBonusTransfer(params: {
  readonly id: string;
  readonly scheduleId: string;
  readonly amountCents: number;
  readonly note: string;
  readonly now: string;
}): AllowanceTransfer {
  if (params.amountCents <= 0) {
    throw new RangeError('Bonus amount must be positive');
  }
  return {
    id: params.id,
    scheduleId: params.scheduleId,
    amountCents: params.amountCents,
    type: 'bonus',
    note: params.note,
    transferredAt: params.now,
  };
}

/**
 * Checks if a transfer is due based on the schedule's next transfer date.
 *
 * @param schedule - The allowance schedule
 * @param now - Current ISO-8601 timestamp
 * @returns True if a transfer should be executed
 */
export function isTransferDue(schedule: AllowanceSchedule, now: string): boolean {
  if (!schedule.active) return false;
  return now >= schedule.nextTransferDate;
}

/**
 * Computes total allowance paid from a history of transfers.
 *
 * @param transfers - Array of allowance transfers
 * @returns Total in cents
 */
export function totalAllowancePaid(transfers: readonly AllowanceTransfer[]): number {
  return transfers.reduce((sum, t) => sum + t.amountCents, 0);
}

/**
 * Filters transfer history by schedule and optional date range.
 *
 * @param transfers - All transfers
 * @param scheduleId - Schedule ID to filter
 * @param fromDate - Optional start date (ISO-8601)
 * @param toDate - Optional end date (ISO-8601)
 * @returns Filtered transfers
 */
export function filterTransferHistory(
  transfers: readonly AllowanceTransfer[],
  scheduleId: string,
  fromDate?: string,
  toDate?: string,
): readonly AllowanceTransfer[] {
  return transfers.filter((t) => {
    if (t.scheduleId !== scheduleId) return false;
    if (fromDate && t.transferredAt < fromDate) return false;
    if (toDate && t.transferredAt > toDate) return false;
    return true;
  });
}
