// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAINTENANCE_INTERVALS_MILES,
  classifyVehicleExpense,
  computeMaintenanceReminders,
  getVehicleCostBehavior,
  inferVehicleCategory,
  summarizeVehicleCosts,
  type MaintenanceInterval,
  type VehicleExpenseEntry,
  type VehicleTransactionInput,
} from './vehicle-cost-per-mile';

describe('getVehicleCostBehavior', () => {
  it('classifies usage-based costs as variable and time-based costs as fixed', () => {
    expect(getVehicleCostBehavior('fuel')).toBe('variable');
    expect(getVehicleCostBehavior('maintenance')).toBe('variable');
    expect(getVehicleCostBehavior('wash')).toBe('variable');
    expect(getVehicleCostBehavior('insurance')).toBe('fixed');
    expect(getVehicleCostBehavior('lease')).toBe('fixed');
    expect(getVehicleCostBehavior('phone')).toBe('fixed');
  });
});

describe('inferVehicleCategory', () => {
  it('infers fuel from a gas-station payee', () => {
    expect(
      inferVehicleCategory({ payee: 'Chevron #123', note: null, tags: [], categoryName: null }),
    ).toBe('fuel');
  });

  it('prefers the strongest keyword match', () => {
    expect(
      inferVehicleCategory({ payee: 'Discount Tire', note: null, tags: [], categoryName: null }),
    ).toBe('tires');
  });

  it('returns null when nothing matches', () => {
    expect(
      inferVehicleCategory({ payee: 'Grocery Store', note: null, tags: [], categoryName: null }),
    ).toBeNull();
  });
});

describe('classifyVehicleExpense', () => {
  const base: VehicleTransactionInput = {
    id: 't1',
    date: '2024-03-01',
    payee: 'Shell',
    note: 'Fill up',
    amountCents: -4_500,
    type: 'EXPENSE',
    tags: ['vehicle-expense'],
    customFields: null,
  };

  it('classifies a tagged expense and stores a positive amount', () => {
    const entry = classifyVehicleExpense(base);
    expect(entry).not.toBeNull();
    expect(entry?.category).toBe('fuel');
    expect(entry?.amountCents).toBe(4_500);
  });

  it('honors an explicit category and odometer in custom fields', () => {
    const entry = classifyVehicleExpense({
      ...base,
      tags: [],
      payee: 'Auto Shop',
      note: 'New set',
      customFields: { vehicleCostCategory: 'tires', vehicleOdometer: '62000' },
    });
    expect(entry?.category).toBe('tires');
    expect(entry?.odometer).toBe(62_000);
  });

  it('ignores non-expense transactions', () => {
    expect(classifyVehicleExpense({ ...base, type: 'INCOME' })).toBeNull();
    expect(classifyVehicleExpense({ ...base, type: 'TRANSFER' })).toBeNull();
  });

  it('skips untagged transactions unless inferUntagged is enabled', () => {
    const untagged: VehicleTransactionInput = { ...base, tags: [] };
    expect(classifyVehicleExpense(untagged)).toBeNull();
    expect(classifyVehicleExpense(untagged, { inferUntagged: true })?.category).toBe('fuel');
  });

  it('falls back to "other" for a flagged expense with no recognizable category', () => {
    const entry = classifyVehicleExpense({
      ...base,
      payee: 'Misc Vendor',
      note: 'unknown',
    });
    expect(entry?.category).toBe('other');
  });
});

describe('summarizeVehicleCosts', () => {
  const expenses: VehicleExpenseEntry[] = [
    { id: 'e1', date: '2024-03-01', category: 'fuel', amountCents: 20_000 },
    { id: 'e2', date: '2024-03-05', category: 'maintenance', amountCents: 5_000 },
    { id: 'e3', date: '2024-03-10', category: 'insurance', amountCents: 12_000 },
    { id: 'e4', date: '2024-03-12', category: 'wash', amountCents: 1_500 },
    { id: 'e5', date: '2024-03-20', category: 'phone', amountCents: 3_000 },
  ];

  it('computes totals, fixed/variable split, and per-mile / per-shift metrics', () => {
    const summary = summarizeVehicleCosts({ expenses, milesDriven: 500, activeShifts: 10 });

    expect(summary.totalCostCents).toBe(41_500);
    expect(summary.variableCostCents).toBe(26_500); // fuel + maintenance + wash
    expect(summary.fixedCostCents).toBe(15_000); // insurance + phone
    expect(summary.costPerMileCents).toBe(83);
    expect(summary.variableCostPerMileCents).toBe(53);
    expect(summary.costPerShiftCents).toBe(4_150);
    expect(summary.fixedCostPerShiftCents).toBe(1_500);
  });

  it('summarizes by category in canonical order with per-mile values', () => {
    const summary = summarizeVehicleCosts({ expenses, milesDriven: 500, activeShifts: 10 });
    expect(summary.byCategory.map((c) => c.category)).toEqual([
      'fuel',
      'maintenance',
      'wash',
      'insurance',
      'phone',
    ]);
    const fuel = summary.byCategory.find((c) => c.category === 'fuel');
    expect(fuel?.costPerMileCents).toBe(40);
    expect(fuel?.transactionCount).toBe(1);
  });

  it('returns null per-mile metrics when no miles are driven', () => {
    const summary = summarizeVehicleCosts({ expenses, milesDriven: 0 });
    expect(summary.costPerMileCents).toBeNull();
    expect(summary.variableCostPerMileCents).toBeNull();
    expect(summary.byCategory.every((c) => c.costPerMileCents === null)).toBe(true);
  });

  it('returns null per-shift metrics when there are no active shifts', () => {
    const summary = summarizeVehicleCosts({ expenses, milesDriven: 500 });
    expect(summary.costPerShiftCents).toBeNull();
    expect(summary.fixedCostPerShiftCents).toBeNull();
  });

  it('filters expenses outside the reporting window', () => {
    const summary = summarizeVehicleCosts({
      expenses,
      milesDriven: 500,
      startDate: '2024-03-04',
      endDate: '2024-03-15',
    });
    // Only maintenance, insurance, and wash fall in range.
    expect(summary.totalCostCents).toBe(18_500);
  });

  it('handles an empty expense list', () => {
    const summary = summarizeVehicleCosts({ expenses: [], milesDriven: 100, activeShifts: 2 });
    expect(summary.totalCostCents).toBe(0);
    expect(summary.costPerMileCents).toBe(0);
    expect(summary.byCategory).toEqual([]);
  });
});

describe('computeMaintenanceReminders', () => {
  const intervals: MaintenanceInterval[] = [
    {
      id: 'oil',
      label: 'Oil change',
      intervalMiles: DEFAULT_MAINTENANCE_INTERVALS_MILES.oilChange,
      lastServiceOdometer: 60_000,
    },
  ];

  it('reports an upcoming service as ok', () => {
    const [reminder] = computeMaintenanceReminders(intervals, 64_200);
    expect(reminder.nextServiceOdometer).toBe(65_000);
    expect(reminder.milesRemaining).toBe(800);
    expect(reminder.milesOverdue).toBe(0);
    expect(reminder.percentUsed).toBe(84);
    expect(reminder.status).toBe('ok');
  });

  it('flags a service within the due-soon window', () => {
    const [reminder] = computeMaintenanceReminders(intervals, 64_800);
    expect(reminder.milesRemaining).toBe(200);
    expect(reminder.status).toBe('due_soon');
    expect(reminder.percentUsed).toBe(96);
  });

  it('flags an overdue service with positive overdue miles', () => {
    const [reminder] = computeMaintenanceReminders(intervals, 65_500);
    expect(reminder.milesRemaining).toBe(-500);
    expect(reminder.milesOverdue).toBe(500);
    expect(reminder.percentUsed).toBe(110);
    expect(reminder.status).toBe('overdue');
  });

  it('respects a custom due-soon threshold', () => {
    const [reminder] = computeMaintenanceReminders(intervals, 64_200, { dueSoonMiles: 1_000 });
    expect(reminder.status).toBe('due_soon');
  });
});
