// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { getMileageRate } from '../calculator';
import { appendShiftLeg, createWorkShift } from '../shifts';
import { buildShiftMileageAuditCsv, generateShiftMileageAuditReport } from '../reports';
import type { TripEntry, WorkShift } from '../types';

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

function makeShifts(): WorkShift[] {
  let doorDash = createWorkShift({ platform: 'DoorDash', startedAt: '2024-06-01T08:00:00.000Z' });
  doorDash = appendShiftLeg(doorDash, legAt({ id: 'dd-1', miles: 10 }));
  doorDash = appendShiftLeg(
    doorDash,
    legAt({ id: 'dd-2', miles: 6, endLocation: 'Store cluster' }),
  );
  // A personal leg must be excluded from the audit trail.
  doorDash = appendShiftLeg(doorDash, legAt({ id: 'dd-3', miles: 4, purpose: 'personal' }));

  let uber = createWorkShift({ platform: 'UberEats', startedAt: '2024-06-02T08:00:00.000Z' });
  uber = appendShiftLeg(uber, legAt({ id: 'ue-1', miles: 8, date: '2024-06-02' }));

  return [doorDash, uber];
}

describe('shift mileage audit report', () => {
  it('produces an IRS-friendly audit trail grouped by shift and platform', () => {
    const businessRate = getMileageRate('business', 2024);
    const report = generateShiftMileageAuditReport({ shifts: makeShifts() });

    // Personal leg excluded -> 3 business legs.
    expect(report.legs).toHaveLength(3);
    const ddLeg = report.legs.find((leg) => leg.legId === 'dd-1');
    expect(ddLeg).toMatchObject({
      platform: 'DoorDash',
      purpose: 'business',
      miles: 10,
      rateCentsPerMile: businessRate,
      deductionCents: Math.round(10 * businessRate),
    });

    // Per-shift rollup excludes the personal leg.
    const ddShift = report.shifts.find((shift) => shift.platform === 'DoorDash');
    expect(ddShift?.miles).toBe(16);
    expect(ddShift?.deductionCents).toBe(
      Math.round(10 * businessRate) + Math.round(6 * businessRate),
    );

    // Per-platform rollup.
    const platforms = report.byPlatform.map((entry) => entry.platform);
    expect(platforms).toEqual(['DoorDash', 'UberEats']);

    expect(report.totalMiles).toBe(24);
    expect(report.totalDeductionCents).toBe(
      Math.round(10 * businessRate) + Math.round(6 * businessRate) + Math.round(8 * businessRate),
    );
  });

  it('honours the reporting period filter', () => {
    const report = generateShiftMileageAuditReport({
      shifts: makeShifts(),
      startDate: '2024-06-02',
      endDate: '2024-06-02',
    });

    expect(report.shifts).toHaveLength(1);
    expect(report.shifts[0]?.platform).toBe('UberEats');
  });

  it('serialises a CSV audit trail with a header and totals row', () => {
    const csv = buildShiftMileageAuditCsv(
      generateShiftMileageAuditReport({ shifts: makeShifts() }),
    );
    const lines = csv.split('\r\n');

    expect(lines[0]).toContain('Date,Platform,Shift ID,Purpose');
    // header + 3 legs + total row.
    expect(lines).toHaveLength(5);
    expect(lines[lines.length - 1]).toContain('Total');
  });
});
