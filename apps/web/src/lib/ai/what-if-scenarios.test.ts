// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { deleteScenarioDraft, predictWhatIfScenario, saveScenarioDraft } from './what-if-scenarios';

describe('predictWhatIfScenario', () => {
  it('keeps baseline isolated while applying one-time scenario math', () => {
    const result = predictWhatIfScenario({
      currentBalanceCents: 100_000,
      baselineDailyNetCents: 1_000,
      dailyVarianceCents: 500,
      horizonDays: 10,
      asOfDate: '2025-01-01',
      changes: [
        {
          id: 'bill',
          description: 'New bill',
          type: 'expense',
          amountCents: 20_000,
          startDate: '2025-01-05',
          frequency: 'once',
        },
      ],
    });

    expect(result.baseline.expectedBalanceCents).toBe(110_000);
    expect(result.scenario.expectedBalanceCents).toBe(90_000);
    expect(result.deltaCents).toBe(-20_000);
  });

  it('applies recurring changes inside the horizon', () => {
    const result = predictWhatIfScenario({
      currentBalanceCents: 100_000,
      baselineDailyNetCents: 0,
      dailyVarianceCents: 0,
      horizonDays: 21,
      asOfDate: '2025-01-01',
      changes: [
        {
          id: 'pay',
          description: 'Side income',
          type: 'income',
          amountCents: 10_000,
          startDate: '2025-01-02',
          frequency: 'weekly',
        },
      ],
    });

    expect(result.deltaCents).toBe(30_000);
  });

  it('flags overdraft, safety-buffer, and missed-goal risks', () => {
    const result = predictWhatIfScenario({
      currentBalanceCents: 20_000,
      baselineDailyNetCents: -1_000,
      dailyVarianceCents: 5_000,
      horizonDays: 10,
      asOfDate: '2025-01-01',
      safetyBufferCents: 15_000,
      changes: [
        {
          id: 'goal',
          description: 'Goal transfer',
          type: 'goal-contribution',
          amountCents: 15_000,
          startDate: '2025-01-02',
          frequency: 'once',
        },
      ],
    });

    expect(result.riskFlags).toContain('overdraft-risk');
    expect(result.riskFlags).toContain('safety-buffer-breach');
    expect(result.riskFlags).toContain('goal-contribution-at-risk');
  });

  it('saves, edits, and deletes local drafts without mutating real inputs', () => {
    const first = saveScenarioDraft(
      [],
      { id: 'd1', name: 'Move', changes: [] },
      '2025-01-01T00:00:00Z',
    );
    const edited = saveScenarioDraft(
      first,
      { id: 'd1', name: 'Move later', changes: [] },
      '2025-01-02T00:00:00Z',
    );
    const deleted = deleteScenarioDraft(edited, 'd1');

    expect(first[0].name).toBe('Move');
    expect(edited[0].name).toBe('Move later');
    expect(deleted).toEqual([]);
  });
});
