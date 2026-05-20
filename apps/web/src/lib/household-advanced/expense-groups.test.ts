// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  createExpenseGroup,
  splitEqual,
  splitByPercentage,
  splitExact,
  splitByIncomeRatio,
  createGroupExpense,
  computeBalances,
  computeSettlements,
  getExpensesByGroup,
  computeGroupTotal,
} from './expense-groups';

const NOW = '2025-01-15T10:00:00.000Z';

describe('expense-groups', () => {
  describe('createExpenseGroup', () => {
    it('creates a group with correct fields', () => {
      const g = createExpenseGroup('g1', 'Trip', 'Beach trip', ['u1', 'u2'], 'equal', NOW);
      expect(g.id).toBe('g1');
      expect(g.memberIds).toEqual(['u1', 'u2']);
      expect(g.splitMethod).toBe('equal');
    });
  });

  describe('splitEqual', () => {
    it('splits evenly', () => {
      const splits = splitEqual(9000, ['u1', 'u2', 'u3']);
      expect(splits).toHaveLength(3);
      expect(splits.every((s) => s.amountCents === 3000)).toBe(true);
    });

    it('distributes remainder to first members', () => {
      const splits = splitEqual(10000, ['u1', 'u2', 'u3']);
      const total = splits.reduce((s, sp) => s + sp.amountCents, 0);
      expect(total).toBe(10000);
      // 10000/3 = 3333 r1, so first member gets 3334
      expect(splits[0].amountCents).toBe(3334);
      expect(splits[1].amountCents).toBe(3333);
      expect(splits[2].amountCents).toBe(3333);
    });

    it('returns empty for no members', () => {
      expect(splitEqual(10000, [])).toEqual([]);
    });
  });

  describe('splitByPercentage', () => {
    it('splits by percentage', () => {
      const splits = splitByPercentage(10000, [
        { userId: 'u1', percent: 60 },
        { userId: 'u2', percent: 40 },
      ]);
      expect(splits[0].amountCents).toBe(6000);
      expect(splits[1].amountCents).toBe(4000);
    });

    it('handles rounding remainder', () => {
      const splits = splitByPercentage(10001, [
        { userId: 'u1', percent: 33 },
        { userId: 'u2', percent: 33 },
        { userId: 'u3', percent: 34 },
      ]);
      const total = splits.reduce((s, sp) => s + sp.amountCents, 0);
      expect(total).toBe(10001);
    });

    it('handles all-zero percentages', () => {
      const splits = splitByPercentage(10000, [
        { userId: 'u1', percent: 0 },
        { userId: 'u2', percent: 0 },
      ]);
      expect(splits.every((s) => s.amountCents === 0)).toBe(true);
    });
  });

  describe('splitExact', () => {
    it('returns splits when sum matches', () => {
      const splits = splitExact(10000, [
        { userId: 'u1', amountCents: 7000 },
        { userId: 'u2', amountCents: 3000 },
      ]);
      expect(splits).toHaveLength(2);
    });

    it('returns empty when sum does not match', () => {
      const splits = splitExact(10000, [
        { userId: 'u1', amountCents: 7000 },
        { userId: 'u2', amountCents: 4000 },
      ]);
      expect(splits).toEqual([]);
    });
  });

  describe('splitByIncomeRatio', () => {
    it('splits proportionally to income', () => {
      const splits = splitByIncomeRatio(10000, [
        { userId: 'u1', incomeCents: 60000_00 },
        { userId: 'u2', incomeCents: 40000_00 },
      ]);
      const total = splits.reduce((s, sp) => s + sp.amountCents, 0);
      expect(total).toBe(10000);
      expect(splits[0].amountCents).toBe(6000);
      expect(splits[1].amountCents).toBe(4000);
    });

    it('falls back to equal split when all incomes are 0', () => {
      const splits = splitByIncomeRatio(10000, [
        { userId: 'u1', incomeCents: 0 },
        { userId: 'u2', incomeCents: 0 },
      ]);
      expect(splits[0].amountCents).toBe(5000);
      expect(splits[1].amountCents).toBe(5000);
    });
  });

  describe('computeBalances', () => {
    it('computes correct balances for a simple case', () => {
      const expense = createGroupExpense(
        'e1',
        'g1',
        'u1',
        6000,
        'Dinner',
        NOW,
        splitEqual(6000, ['u1', 'u2', 'u3']),
      );
      const balances = computeBalances([expense], ['u1', 'u2', 'u3']);
      // u1 paid 6000, their share is 2000, so they are owed 4000
      const u1 = balances.find((b) => b.userId === 'u1')!;
      expect(u1.balanceCents).toBe(4000);
      // u2 and u3 each owe 2000
      const u2 = balances.find((b) => b.userId === 'u2')!;
      expect(u2.balanceCents).toBe(-2000);
    });
  });

  describe('computeSettlements', () => {
    it('computes minimal settlements', () => {
      const balances = [
        { userId: 'u1', balanceCents: 4000 },
        { userId: 'u2', balanceCents: -2000 },
        { userId: 'u3', balanceCents: -2000 },
      ];
      const settlements = computeSettlements(balances);
      expect(settlements).toHaveLength(2);
      const totalSettled = settlements.reduce((s, st) => s + st.amountCents, 0);
      expect(totalSettled).toBe(4000);
    });

    it('returns empty when everyone is balanced', () => {
      const balances = [
        { userId: 'u1', balanceCents: 0 },
        { userId: 'u2', balanceCents: 0 },
      ];
      expect(computeSettlements(balances)).toEqual([]);
    });
  });

  describe('group history', () => {
    it('filters expenses by group', () => {
      const e1 = createGroupExpense('e1', 'g1', 'u1', 1000, 'd', NOW, []);
      const e2 = createGroupExpense('e2', 'g2', 'u1', 2000, 'd', NOW, []);
      expect(getExpensesByGroup([e1, e2], 'g1')).toHaveLength(1);
    });

    it('computes group total', () => {
      const e1 = createGroupExpense('e1', 'g1', 'u1', 1000, 'd', NOW, []);
      const e2 = createGroupExpense('e2', 'g1', 'u2', 2000, 'd', NOW, []);
      expect(computeGroupTotal([e1, e2])).toBe(3000);
    });
  });
});
