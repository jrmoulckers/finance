// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { projectGoalMilestones } from './goal-projection-engine';

describe('goal projection and milestone engine', () => {
  it('calculates weekly and paycheck targets with on-track state', () => {
    const summary = projectGoalMilestones({
      startCents: 0,
      currentCents: 5000_00,
      targetCents: 10000_00,
      startDate: '2026-01-01',
      today: '2026-02-15',
      dueDate: '2026-04-01',
      paychecksRemaining: 3,
    });
    expect(summary.weeklyTargetCents).toBe(71429);
    expect(summary.paycheckTargetCents).toBe(166667);
    expect(summary.milestonePercent).toBe(50);
    expect(summary.messageToken).toBe('goal.on-track');
  });

  it('classifies behind, ahead, and complete goals', () => {
    const common = { startCents: 0, targetCents: 10000_00, startDate: '2026-01-01', today: '2026-03-01', dueDate: '2026-04-01', paychecksRemaining: 2 };
    expect(projectGoalMilestones({ ...common, currentCents: 1000_00 }).state).toBe('behind');
    expect(projectGoalMilestones({ ...common, currentCents: 9500_00 }).state).toBe('ahead');
    expect(projectGoalMilestones({ ...common, currentCents: 10000_00 }).state).toBe('complete');
  });
});
