// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { GoalContributionEntry } from './types';
import {
  bankersRound,
  buildMemberContributions,
  calculateFairShares,
  getMemberContributionHistory,
  memberContributionPercentage,
  totalGoalContributions,
} from './goal-contributions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER_A = 'member-a';
const MEMBER_B = 'member-b';
const MEMBER_C = 'member-c';
const GOAL_1 = 'goal-1';
const GOAL_2 = 'goal-2';

const MEMBER_NAMES = new Map<string, string | null>([
  [MEMBER_A, 'Alice'],
  [MEMBER_B, 'Bob'],
  [MEMBER_C, null],
]);

const ENTRIES: GoalContributionEntry[] = [
  { goalId: GOAL_1, memberId: MEMBER_A, amountCents: 300_00, date: '2025-01-01' },
  { goalId: GOAL_1, memberId: MEMBER_A, amountCents: 200_00, date: '2025-01-15' },
  { goalId: GOAL_1, memberId: MEMBER_B, amountCents: 500_00, date: '2025-01-10' },
  { goalId: GOAL_2, memberId: MEMBER_A, amountCents: 100_00, date: '2025-01-05' },
];

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 2.5 to 2 (round half to even)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds 3.5 to 4 (round half to even)', () => {
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds 2.4 normally to 2', () => {
    expect(bankersRound(2.4)).toBe(2);
  });

  it('rounds 2.6 normally to 3', () => {
    expect(bankersRound(2.6)).toBe(3);
  });

  it('returns 0 for NaN', () => {
    expect(bankersRound(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(bankersRound(Infinity)).toBe(0);
  });

  it('handles negative values with half-to-even', () => {
    // -2.5 → floor is -3, decimal = 0.5, -3 is odd → -3 + 1 = -2
    expect(bankersRound(-2.5)).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// totalGoalContributions
// ---------------------------------------------------------------------------

describe('totalGoalContributions', () => {
  it('sums contributions for a specific goal', () => {
    expect(totalGoalContributions(ENTRIES, GOAL_1)).toBe(1000_00);
  });

  it('returns 0 for a goal with no contributions', () => {
    expect(totalGoalContributions(ENTRIES, 'goal-none')).toBe(0);
  });

  it('returns 0 for empty entries', () => {
    expect(totalGoalContributions([], GOAL_1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildMemberContributions
// ---------------------------------------------------------------------------

describe('buildMemberContributions', () => {
  it('calculates per-member totals and percentages', () => {
    const result = buildMemberContributions(ENTRIES, GOAL_1, MEMBER_NAMES);
    expect(result).toHaveLength(2);

    // B contributed 500_00 (50%), A contributed 500_00 (50%)
    // Sorted by total descending — both equal, order by insertion
    const memberA = result.find((m) => m.memberId === MEMBER_A);
    expect(memberA?.totalCents).toBe(500_00);
    expect(memberA?.percentageOfTotal).toBe(50);
    expect(memberA?.memberName).toBe('Alice');

    const memberB = result.find((m) => m.memberId === MEMBER_B);
    expect(memberB?.totalCents).toBe(500_00);
    expect(memberB?.percentageOfTotal).toBe(50);
    expect(memberB?.memberName).toBe('Bob');
  });

  it('handles single contributor', () => {
    const result = buildMemberContributions(ENTRIES, GOAL_2, MEMBER_NAMES);
    expect(result).toHaveLength(1);
    expect(result[0].percentageOfTotal).toBe(100);
  });

  it('handles no contributions', () => {
    const result = buildMemberContributions([], GOAL_1, MEMBER_NAMES);
    expect(result).toHaveLength(0);
  });

  it('uses null when member name is not found', () => {
    const result = buildMemberContributions(
      [{ goalId: GOAL_1, memberId: MEMBER_C, amountCents: 100_00, date: '2025-01-01' }],
      GOAL_1,
      MEMBER_NAMES,
    );
    expect(result[0].memberName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateFairShares
// ---------------------------------------------------------------------------

describe('calculateFairShares', () => {
  it('splits evenly among members', () => {
    const result = calculateFairShares(1000_00, ENTRIES, GOAL_1, [MEMBER_A, MEMBER_B]);
    expect(result).toHaveLength(2);

    const shareA = result.find((r) => r.memberId === MEMBER_A);
    expect(shareA?.expectedCents).toBe(500_00);
    expect(shareA?.actualCents).toBe(500_00);
    expect(shareA?.differenceCents).toBe(0);

    const shareB = result.find((r) => r.memberId === MEMBER_B);
    expect(shareB?.expectedCents).toBe(500_00);
    expect(shareB?.actualCents).toBe(500_00);
    expect(shareB?.differenceCents).toBe(0);
  });

  it('distributes remainder cents to first members', () => {
    const result = calculateFairShares(100_01, [], GOAL_1, [MEMBER_A, MEMBER_B, MEMBER_C]);
    // 10001 / 3 = 3333 base, remainder = 2
    expect(result[0].expectedCents).toBe(3334); // gets +1
    expect(result[1].expectedCents).toBe(3334); // gets +1
    expect(result[2].expectedCents).toBe(3333); // no +1
    // Total: 3334 + 3334 + 3333 = 10001 ✓
  });

  it('returns empty for no members', () => {
    expect(calculateFairShares(1000_00, ENTRIES, GOAL_1, [])).toEqual([]);
  });

  it("shows under-contribution for members who haven't contributed", () => {
    const result = calculateFairShares(1000_00, ENTRIES, GOAL_1, [MEMBER_A, MEMBER_B, MEMBER_C]);
    const shareC = result.find((r) => r.memberId === MEMBER_C);
    expect(shareC?.actualCents).toBe(0);
    expect(shareC?.differenceCents).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// getMemberContributionHistory
// ---------------------------------------------------------------------------

describe('getMemberContributionHistory', () => {
  it('returns contributions sorted by date ascending', () => {
    const result = getMemberContributionHistory(ENTRIES, GOAL_1, MEMBER_A);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2025-01-01');
    expect(result[1].date).toBe('2025-01-15');
  });

  it('returns empty for non-existent member', () => {
    const result = getMemberContributionHistory(ENTRIES, GOAL_1, 'member-none');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// memberContributionPercentage
// ---------------------------------------------------------------------------

describe('memberContributionPercentage', () => {
  it('calculates correct percentage', () => {
    expect(memberContributionPercentage(ENTRIES, GOAL_1, MEMBER_A)).toBe(50);
    expect(memberContributionPercentage(ENTRIES, GOAL_1, MEMBER_B)).toBe(50);
  });

  it('returns 0 when no contributions exist', () => {
    expect(memberContributionPercentage([], GOAL_1, MEMBER_A)).toBe(0);
  });

  it('returns 100 for sole contributor', () => {
    expect(memberContributionPercentage(ENTRIES, GOAL_2, MEMBER_A)).toBe(100);
  });
});
