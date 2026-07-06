// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildPayoffMilestones } from './payoff-milestones';
import type { AmortizationSchedule, StrategyResult } from '../debt-types';

function schedule(debtId: string, debtName: string, monthsToPayoff: number): AmortizationSchedule {
  return {
    debtId,
    debtName,
    entries: [],
    totalInterestCents: 0,
    totalPaidCents: 0,
    monthsToPayoff,
  };
}

function result(
  schedules: AmortizationSchedule[],
  fullyPaidOff: boolean,
): Pick<StrategyResult, 'schedules' | 'fullyPaidOff'> {
  return { schedules, fullyPaidOff };
}

describe('buildPayoffMilestones', () => {
  it('orders milestones by the month each debt clears and stamps dates', () => {
    const milestones = buildPayoffMilestones(
      result(
        [schedule('b', 'Card B', 9), schedule('a', 'Card A', 4), schedule('c', 'Car Loan', 20)],
        true,
      ),
      '2026-01-15',
    );

    expect(milestones.map((m) => m.debtId)).toEqual(['a', 'b', 'c']);
    expect(milestones[0]).toMatchObject({
      debtName: 'Card A',
      monthsToPayoff: 4,
      payoffDateIso: '2026-05-15',
    });
    expect(milestones[1].payoffDateIso).toBe('2026-10-15');
    expect(milestones[2].payoffDateIso).toBe('2027-09-15');
  });

  it('returns an empty list when the plan never reaches debt-free', () => {
    const milestones = buildPayoffMilestones(
      result([schedule('a', 'Card A', 4), schedule('b', 'Card B', 1200)], false),
      '2026-01-15',
    );
    expect(milestones).toEqual([]);
  });

  it('skips debts that never register a payoff month', () => {
    const milestones = buildPayoffMilestones(
      result([schedule('a', 'Card A', 0), schedule('b', 'Card B', 6)], true),
      '2026-01-15',
    );
    expect(milestones.map((m) => m.debtId)).toEqual(['b']);
  });

  it('does not mutate the input schedules order', () => {
    const schedules = [schedule('b', 'Card B', 9), schedule('a', 'Card A', 4)];
    buildPayoffMilestones(result(schedules, true), '2026-01-15');
    expect(schedules.map((s) => s.debtId)).toEqual(['b', 'a']);
  });
});
