// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  createSharedExpense,
  deactivateSharedExpense,
  updateSharedExpenseAmount,
  generateOccurrence,
  generateOccurrenceWithData,
  adjustOccurrence,
  getOccurrencesForExpense,
  computeMemberTotal,
  computeAnnualSummary,
  computeNextOccurrenceDate,
} from './shared-expenses';
import type { SharedExpense } from './types';

const NOW = '2025-01-15T10:00:00.000Z';

const makeExpense = (overrides: Partial<SharedExpense> = {}): SharedExpense => ({
  id: 'se1',
  householdId: 'hh1',
  description: 'Rent',
  amountCents: 200000, // $2,000
  cadence: 'monthly',
  splitMethod: 'equal',
  memberIds: ['u1', 'u2'],
  startDate: NOW,
  endDate: null,
  active: true,
  ...overrides,
});

describe('shared-expenses', () => {
  describe('createSharedExpense', () => {
    it('creates an active shared expense', () => {
      const se = createSharedExpense(
        'se1',
        'hh1',
        'Rent',
        200000,
        'monthly',
        'equal',
        ['u1', 'u2'],
        NOW,
      );
      expect(se.active).toBe(true);
      expect(se.endDate).toBeNull();
      expect(se.amountCents).toBe(200000);
    });
  });

  describe('deactivateSharedExpense', () => {
    it('sets active to false and sets endDate', () => {
      const se = makeExpense();
      const deactivated = deactivateSharedExpense(se, '2025-12-31T00:00:00.000Z');
      expect(deactivated.active).toBe(false);
      expect(deactivated.endDate).toBe('2025-12-31T00:00:00.000Z');
    });
  });

  describe('updateSharedExpenseAmount', () => {
    it('updates the amount', () => {
      const se = makeExpense();
      const updated = updateSharedExpenseAmount(se, 250000);
      expect(updated.amountCents).toBe(250000);
    });
  });

  describe('generateOccurrence', () => {
    it('generates an equal split occurrence', () => {
      const se = makeExpense();
      const occ = generateOccurrence('occ1', se, NOW);
      expect(occ.splits).toHaveLength(2);
      expect(occ.splits[0].amountCents).toBe(100000);
      expect(occ.splits[1].amountCents).toBe(100000);
      expect(occ.adjustmentNote).toBeNull();
    });
  });

  describe('generateOccurrenceWithData', () => {
    it('splits by percentage', () => {
      const se = makeExpense({ splitMethod: 'percentage' });
      const occ = generateOccurrenceWithData('occ1', se, NOW, [
        { userId: 'u1', percent: 60 },
        { userId: 'u2', percent: 40 },
      ]);
      expect(occ.splits[0].amountCents).toBe(120000);
      expect(occ.splits[1].amountCents).toBe(80000);
    });

    it('splits by income ratio', () => {
      const se = makeExpense({ splitMethod: 'income_ratio' });
      const occ = generateOccurrenceWithData('occ1', se, NOW, [
        { userId: 'u1', incomeCents: 70000_00 },
        { userId: 'u2', incomeCents: 30000_00 },
      ]);
      const total = occ.splits.reduce((s, sp) => s + sp.amountCents, 0);
      expect(total).toBe(200000);
    });

    it('falls back to equal for exact method', () => {
      const se = makeExpense({ splitMethod: 'exact' });
      const occ = generateOccurrenceWithData('occ1', se, NOW, [{ userId: 'u1' }, { userId: 'u2' }]);
      expect(occ.splits[0].amountCents).toBe(100000);
    });
  });

  describe('adjustOccurrence', () => {
    it('replaces splits and adds a note', () => {
      const se = makeExpense();
      const occ = generateOccurrence('occ1', se, NOW);
      const adjusted = adjustOccurrence(
        occ,
        [
          { userId: 'u1', amountCents: 120000 },
          { userId: 'u2', amountCents: 80000 },
        ],
        'u1 covering more this month',
      );
      expect(adjusted.splits[0].amountCents).toBe(120000);
      expect(adjusted.adjustmentNote).toBe('u1 covering more this month');
    });
  });

  describe('getOccurrencesForExpense', () => {
    it('filters by shared expense ID', () => {
      const se = makeExpense();
      const occ1 = generateOccurrence('occ1', se, NOW);
      const occ2 = generateOccurrence('occ2', { ...se, id: 'se2' }, NOW);
      expect(getOccurrencesForExpense([occ1, occ2], 'se1')).toHaveLength(1);
    });
  });

  describe('computeMemberTotal', () => {
    it('sums splits for a member', () => {
      const se = makeExpense();
      const occ1 = generateOccurrence('occ1', se, NOW);
      const occ2 = generateOccurrence('occ2', se, '2025-02-15T10:00:00.000Z');
      expect(computeMemberTotal([occ1, occ2], 'u1')).toBe(200000);
    });
  });

  describe('computeAnnualSummary', () => {
    it('summarises occurrences for a year', () => {
      const se = makeExpense();
      const occs = [
        generateOccurrence('occ1', se, '2025-01-15T10:00:00.000Z'),
        generateOccurrence('occ2', se, '2025-02-15T10:00:00.000Z'),
        generateOccurrence('occ3', se, '2024-12-15T10:00:00.000Z'), // different year
      ];
      const summary = computeAnnualSummary(occs, 2025, ['u1', 'u2']);
      expect(summary.occurrenceCount).toBe(2);
      expect(summary.totalCents).toBe(400000);
      expect(summary.perMember).toHaveLength(2);
      expect(summary.perMember[0].totalCents).toBe(200000);
    });
  });

  describe('computeNextOccurrenceDate', () => {
    it('computes weekly', () => {
      const next = computeNextOccurrenceDate('2025-01-15T10:00:00.000Z', 'weekly');
      expect(new Date(next).getDate()).toBe(22);
    });

    it('computes biweekly', () => {
      const next = computeNextOccurrenceDate('2025-01-15T10:00:00.000Z', 'biweekly');
      expect(new Date(next).getDate()).toBe(29);
    });

    it('computes monthly', () => {
      const next = computeNextOccurrenceDate('2025-01-15T10:00:00.000Z', 'monthly');
      expect(new Date(next).getMonth()).toBe(1); // February
    });

    it('computes quarterly', () => {
      const next = computeNextOccurrenceDate('2025-01-15T10:00:00.000Z', 'quarterly');
      expect(new Date(next).getMonth()).toBe(3); // April
    });

    it('computes annually', () => {
      const next = computeNextOccurrenceDate('2025-01-15T10:00:00.000Z', 'annually');
      expect(new Date(next).getFullYear()).toBe(2026);
    });
  });
});
