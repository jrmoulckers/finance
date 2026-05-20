// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for automated allowance transfer engine.
 *
 * References: #1797
 */

import { describe, it, expect } from 'vitest';
import {
  createAllowanceSchedule,
  pauseSchedule,
  resumeSchedule,
  updateAllowanceAmount,
  calculateNextTransferDate,
  simulateTransfer,
  createBonusTransfer,
  isTransferDue,
  totalAllowancePaid,
  filterTransferHistory,
} from './allowance-engine';
import type { AllowanceTransfer } from './types';

const NOW = '2025-01-15T12:00:00.000Z';

describe('allowance-engine', () => {
  describe('createAllowanceSchedule', () => {
    it('creates a weekly schedule', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: NOW,
      });
      expect(schedule.active).toBe(true);
      expect(schedule.amountCents).toBe(500);
      expect(schedule.frequency).toBe('weekly');
    });

    it('throws for non-positive amount', () => {
      expect(() =>
        createAllowanceSchedule({
          id: 'sch-1',
          accountId: 'acc-1',
          recipientName: 'Alice',
          amountCents: 0,
          frequency: 'weekly',
          dayOfPeriod: 1,
          startDate: NOW,
        }),
      ).toThrow(RangeError);
    });

    it('throws for invalid monthly day', () => {
      expect(() =>
        createAllowanceSchedule({
          id: 'sch-1',
          accountId: 'acc-1',
          recipientName: 'Alice',
          amountCents: 500,
          frequency: 'monthly',
          dayOfPeriod: 31,
          startDate: NOW,
        }),
      ).toThrow(RangeError);
    });

    it('throws for invalid weekly day', () => {
      expect(() =>
        createAllowanceSchedule({
          id: 'sch-1',
          accountId: 'acc-1',
          recipientName: 'Alice',
          amountCents: 500,
          frequency: 'weekly',
          dayOfPeriod: 8,
          startDate: NOW,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('pauseSchedule / resumeSchedule', () => {
    it('pauses and resumes a schedule', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: NOW,
      });
      const paused = pauseSchedule(schedule);
      expect(paused.active).toBe(false);

      const resumed = resumeSchedule(paused, '2025-02-01T00:00:00.000Z');
      expect(resumed.active).toBe(true);
      expect(resumed.nextTransferDate).toBe('2025-02-01T00:00:00.000Z');
    });
  });

  describe('updateAllowanceAmount', () => {
    it('updates the amount', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: NOW,
      });
      const updated = updateAllowanceAmount(schedule, 750);
      expect(updated.amountCents).toBe(750);
    });

    it('throws for non-positive amount', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: NOW,
      });
      expect(() => updateAllowanceAmount(schedule, -100)).toThrow(RangeError);
    });
  });

  describe('calculateNextTransferDate', () => {
    it('adds 7 days for weekly', () => {
      const next = calculateNextTransferDate('2025-01-15T00:00:00.000Z', 'weekly');
      expect(new Date(next).getUTCDate()).toBe(22);
    });

    it('adds 14 days for biweekly', () => {
      const next = calculateNextTransferDate('2025-01-15T00:00:00.000Z', 'biweekly');
      expect(new Date(next).getUTCDate()).toBe(29);
    });

    it('adds 1 month for monthly', () => {
      const next = calculateNextTransferDate('2025-01-15T00:00:00.000Z', 'monthly');
      expect(new Date(next).getUTCMonth()).toBe(1); // February
    });
  });

  describe('simulateTransfer', () => {
    it('generates a transfer and updates the schedule', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: NOW,
      });
      const { transfer, updatedSchedule } = simulateTransfer(schedule, 'tx-1', NOW);
      expect(transfer.amountCents).toBe(500);
      expect(transfer.type).toBe('regular');
      expect(transfer.scheduleId).toBe('sch-1');
      expect(updatedSchedule.nextTransferDate).not.toBe(NOW);
    });

    it('throws for inactive schedule', () => {
      const schedule = pauseSchedule(
        createAllowanceSchedule({
          id: 'sch-1',
          accountId: 'acc-1',
          recipientName: 'Alice',
          amountCents: 500,
          frequency: 'weekly',
          dayOfPeriod: 1,
          startDate: NOW,
        }),
      );
      expect(() => simulateTransfer(schedule, 'tx-1', NOW)).toThrow();
    });
  });

  describe('createBonusTransfer', () => {
    it('creates a bonus transfer', () => {
      const bonus = createBonusTransfer({
        id: 'tx-bonus',
        scheduleId: 'sch-1',
        amountCents: 2000,
        note: 'Birthday bonus!',
        now: NOW,
      });
      expect(bonus.type).toBe('bonus');
      expect(bonus.amountCents).toBe(2000);
    });

    it('throws for non-positive amount', () => {
      expect(() =>
        createBonusTransfer({
          id: 'tx-bonus',
          scheduleId: 'sch-1',
          amountCents: 0,
          note: 'test',
          now: NOW,
        }),
      ).toThrow(RangeError);
    });
  });

  describe('isTransferDue', () => {
    it('returns true when past next transfer date', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: '2025-01-10T00:00:00.000Z',
      });
      expect(isTransferDue(schedule, NOW)).toBe(true);
    });

    it('returns false when not yet due', () => {
      const schedule = createAllowanceSchedule({
        id: 'sch-1',
        accountId: 'acc-1',
        recipientName: 'Alice',
        amountCents: 500,
        frequency: 'weekly',
        dayOfPeriod: 1,
        startDate: '2025-01-20T00:00:00.000Z',
      });
      expect(isTransferDue(schedule, NOW)).toBe(false);
    });

    it('returns false for inactive schedule', () => {
      const schedule = pauseSchedule(
        createAllowanceSchedule({
          id: 'sch-1',
          accountId: 'acc-1',
          recipientName: 'Alice',
          amountCents: 500,
          frequency: 'weekly',
          dayOfPeriod: 1,
          startDate: '2025-01-10T00:00:00.000Z',
        }),
      );
      expect(isTransferDue(schedule, NOW)).toBe(false);
    });
  });

  describe('totalAllowancePaid', () => {
    it('sums all transfer amounts', () => {
      const transfers: AllowanceTransfer[] = [
        {
          id: 't1',
          scheduleId: 's1',
          amountCents: 500,
          type: 'regular',
          note: '',
          transferredAt: NOW,
        },
        {
          id: 't2',
          scheduleId: 's1',
          amountCents: 500,
          type: 'regular',
          note: '',
          transferredAt: NOW,
        },
        {
          id: 't3',
          scheduleId: 's1',
          amountCents: 2000,
          type: 'bonus',
          note: '',
          transferredAt: NOW,
        },
      ];
      expect(totalAllowancePaid(transfers)).toBe(3000);
    });

    it('returns 0 for empty array', () => {
      expect(totalAllowancePaid([])).toBe(0);
    });
  });

  describe('filterTransferHistory', () => {
    const transfers: AllowanceTransfer[] = [
      {
        id: 't1',
        scheduleId: 's1',
        amountCents: 500,
        type: 'regular',
        note: '',
        transferredAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 't2',
        scheduleId: 's1',
        amountCents: 500,
        type: 'regular',
        note: '',
        transferredAt: '2025-01-08T00:00:00.000Z',
      },
      {
        id: 't3',
        scheduleId: 's2',
        amountCents: 300,
        type: 'regular',
        note: '',
        transferredAt: '2025-01-05T00:00:00.000Z',
      },
    ];

    it('filters by schedule ID', () => {
      expect(filterTransferHistory(transfers, 's1')).toHaveLength(2);
    });

    it('filters by date range', () => {
      const result = filterTransferHistory(
        transfers,
        's1',
        '2025-01-05T00:00:00.000Z',
        '2025-01-10T00:00:00.000Z',
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('t2');
    });
  });
});
