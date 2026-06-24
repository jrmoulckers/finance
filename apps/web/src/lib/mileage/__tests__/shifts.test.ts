// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { getMileageRate } from '../calculator';
import {
  appendShiftLeg,
  buildLegDraftFromPresets,
  computeActiveDurationMs,
  createWorkShift,
  DEFAULT_ROUTE_PRESETS,
  endWorkShift,
  groupShiftsByPlatform,
  pauseWorkShift,
  resumeWorkShift,
  sumShiftDeductionCents,
  sumShiftMiles,
  summarizeWorkShift,
} from '../shifts';
import type { TripEntry, WorkShift } from '../types';

const MINUTE = 60_000;

function legAt(overrides: Partial<TripEntry> & { id: string; miles: number }): TripEntry {
  return {
    date: '2024-06-01',
    startLocation: 'Home',
    endLocation: 'Hotspot',
    odometerStart: null,
    odometerEnd: null,
    purpose: 'business',
    notes: '',
    businessUsePercent: 100,
    createdAt: '2024-06-01T12:00:00.000Z',
    updatedAt: '2024-06-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('work shift model', () => {
  it('starts an active shift on a platform with no legs', () => {
    const shift = createWorkShift({ platform: 'DoorDash', startedAt: '2024-06-01T08:00:00.000Z' });

    expect(shift.status).toBe('active');
    expect(shift.platform).toBe('DoorDash');
    expect(shift.legs).toEqual([]);
    expect(shift.pauses).toEqual([]);
  });

  it('does not double-count time across pause/resume cycles', () => {
    const start = '2024-06-01T08:00:00.000Z';
    let shift = createWorkShift({ platform: 'UberEats', startedAt: start });

    // Pause after 10 minutes, resume 5 minutes later.
    shift = pauseWorkShift(shift, '2024-06-01T08:10:00.000Z');
    shift = resumeWorkShift(shift, '2024-06-01T08:15:00.000Z');
    // End 30 minutes after start.
    shift = endWorkShift(shift, '2024-06-01T08:30:00.000Z');

    // 30 minutes elapsed minus 5 minutes paused = 25 minutes active.
    expect(computeActiveDurationMs(shift)).toBe(25 * MINUTE);
    expect(shift.status).toBe('ended');
  });

  it('closes an open pause when the shift ends so paused time is not lost', () => {
    let shift = createWorkShift({ platform: 'Grubhub', startedAt: '2024-06-01T08:00:00.000Z' });
    shift = pauseWorkShift(shift, '2024-06-01T08:20:00.000Z');
    shift = endWorkShift(shift, '2024-06-01T08:30:00.000Z');

    expect(shift.pauses[0]?.resumedAt).toBe('2024-06-01T08:30:00.000Z');
    // 30 minutes elapsed minus 10 minutes paused = 20 minutes active.
    expect(computeActiveDurationMs(shift)).toBe(20 * MINUTE);
  });

  it('ignores pause/resume when the shift is not in the right state', () => {
    const shift = createWorkShift({ platform: 'DoorDash', startedAt: '2024-06-01T08:00:00.000Z' });
    // Resuming an active shift is a no-op.
    expect(resumeWorkShift(shift)).toBe(shift);
  });

  it('accumulates miles and deduction using the existing IRS rate', () => {
    const businessRate = getMileageRate('business', 2024);
    let shift = createWorkShift({ platform: 'DoorDash', startedAt: '2024-06-01T08:00:00.000Z' });
    shift = appendShiftLeg(shift, legAt({ id: 'leg-1', miles: 10 }));
    shift = appendShiftLeg(shift, legAt({ id: 'leg-2', miles: 6 }));

    expect(sumShiftMiles(shift)).toBe(16);
    expect(sumShiftDeductionCents(shift)).toBe(
      Math.round(10 * businessRate) + Math.round(6 * businessRate),
    );

    const summary = summarizeWorkShift(shift, '2024-06-01T09:00:00.000Z');
    expect(summary.legCount).toBe(2);
    expect(summary.miles).toBe(16);
    expect(summary.deductionCents).toBe(Math.round(16 * businessRate));
    expect(summary.activeDurationMs).toBe(60 * MINUTE);
  });

  it('groups shifts by platform with summed miles and deduction', () => {
    const businessRate = getMileageRate('business', 2024);
    const doorDash: WorkShift = appendShiftLeg(
      createWorkShift({ platform: 'DoorDash', startedAt: '2024-06-01T08:00:00.000Z' }),
      legAt({ id: 'leg-a', miles: 12 }),
    );
    const uber: WorkShift = appendShiftLeg(
      createWorkShift({ platform: 'UberEats', startedAt: '2024-06-02T08:00:00.000Z' }),
      legAt({ id: 'leg-b', miles: 8 }),
    );

    const grouped = groupShiftsByPlatform([doorDash, uber]);
    expect(grouped).toHaveLength(2);
    const doorDashGroup = grouped.find((entry) => entry.platform === 'DoorDash');
    expect(doorDashGroup?.miles).toBe(12);
    expect(doorDashGroup?.deductionCents).toBe(Math.round(12 * businessRate));
  });

  it('prefills a leg draft from route presets without typing', () => {
    const home = DEFAULT_ROUTE_PRESETS.find((preset) => preset.kind === 'home');
    const hotspot = DEFAULT_ROUTE_PRESETS.find((preset) => preset.kind === 'hotspot');

    const draft = buildLegDraftFromPresets({
      startPreset: home,
      endPreset: hotspot,
      miles: 4.2,
      date: '2024-06-03',
    });

    expect(draft.startLocation).toBe('Home');
    expect(draft.endLocation).toBe('Hotspot');
    expect(draft.miles).toBe(4.2);
    expect(draft.purpose).toBe('business');
  });
});
