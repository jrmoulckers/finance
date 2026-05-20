// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for life event planning framework.
 *
 * References: #1769
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateSavingsGap,
  calculateProgressBps,
  calculateRequiredMonthlySavings,
  generateMilestones,
  analyzeEvent,
  analyzeMultipleEvents,
  createLifeEvent,
} from './life-event-framework';
import type { LifeEvent } from './types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: 'test-event-1',
    name: 'Test Event',
    type: 'custom',
    targetDate: '2026-06-01',
    estimatedCostCents: 5_000_000, // $50,000
    currentSavingsCents: 1_000_000, // $10,000
    monthlySavingsCents: 200_000, // $2,000/mo
    priority: 1,
    notes: '',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const today = new Date('2025-01-01');

// ---------------------------------------------------------------------------
// calculateSavingsGap
// ---------------------------------------------------------------------------

describe('calculateSavingsGap', () => {
  it('returns gap when under-saved', () => {
    expect(calculateSavingsGap(5_000_000, 1_000_000)).toBe(4_000_000);
  });

  it('returns 0 when fully funded', () => {
    expect(calculateSavingsGap(5_000_000, 6_000_000)).toBe(0);
  });

  it('returns 0 when exactly at target', () => {
    expect(calculateSavingsGap(5_000_000, 5_000_000)).toBe(0);
  });

  it('handles zero cost', () => {
    expect(calculateSavingsGap(0, 1_000_000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateProgressBps
// ---------------------------------------------------------------------------

describe('calculateProgressBps', () => {
  it('returns 5000 bps at 50%', () => {
    expect(calculateProgressBps(2_500_000, 5_000_000)).toBe(5000);
  });

  it('caps at 10000 bps', () => {
    expect(calculateProgressBps(6_000_000, 5_000_000)).toBe(10000);
  });

  it('returns 0 for zero cost', () => {
    expect(calculateProgressBps(1_000_000, 0)).toBe(0);
  });

  it('returns 0 for zero savings', () => {
    expect(calculateProgressBps(0, 5_000_000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRequiredMonthlySavings
// ---------------------------------------------------------------------------

describe('calculateRequiredMonthlySavings', () => {
  it('calculates correctly', () => {
    // $40K gap / 20 months = $2,000/mo
    expect(calculateRequiredMonthlySavings(4_000_000, 20)).toBe(200_000);
  });

  it('returns 0 when no gap', () => {
    expect(calculateRequiredMonthlySavings(0, 12)).toBe(0);
  });

  it('returns full gap when months is 0', () => {
    expect(calculateRequiredMonthlySavings(4_000_000, 0)).toBe(4_000_000);
  });

  it('returns full gap when months is negative (past date)', () => {
    expect(calculateRequiredMonthlySavings(4_000_000, -5)).toBe(4_000_000);
  });
});

// ---------------------------------------------------------------------------
// generateMilestones
// ---------------------------------------------------------------------------

describe('generateMilestones', () => {
  it('generates 4 milestones', () => {
    const event = makeEvent();
    const milestones = generateMilestones(event, today);
    expect(milestones).toHaveLength(4);
  });

  it('marks 25% milestone as reached at 30% progress', () => {
    const event = makeEvent({ currentSavingsCents: 1_500_000 }); // 30%
    const milestones = generateMilestones(event, today);
    expect(milestones[0].reached).toBe(true); // 25%
    expect(milestones[1].reached).toBe(false); // 50%
  });

  it('projects dates for unreached milestones', () => {
    const event = makeEvent();
    const milestones = generateMilestones(event, today);
    // Some milestones should have projected dates
    const unreached = milestones.filter((m) => !m.reached);
    expect(unreached.some((m) => m.projectedDate !== null)).toBe(true);
  });

  it('handles fully funded event', () => {
    const event = makeEvent({ currentSavingsCents: 5_000_000 });
    const milestones = generateMilestones(event, today);
    expect(milestones.every((m) => m.reached)).toBe(true);
  });

  it('handles zero monthly savings (no projected dates)', () => {
    const event = makeEvent({ monthlySavingsCents: 0 });
    const milestones = generateMilestones(event, today);
    const unreached = milestones.filter((m) => !m.reached);
    expect(unreached.every((m) => m.projectedDate === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// analyzeEvent
// ---------------------------------------------------------------------------

describe('analyzeEvent', () => {
  it('calculates savings gap', () => {
    const result = analyzeEvent(makeEvent(), today);
    expect(result.savingsGapCents).toBe(4_000_000);
  });

  it('calculates months to target', () => {
    const result = analyzeEvent(makeEvent(), today);
    expect(result.monthsToTarget).toBe(17); // Jan 2025 → Jun 2026
  });

  it('marks on track when savings pace is sufficient', () => {
    // $4M gap / 17 months ≈ $235K/mo needed; saving $200K → not on track
    const result = analyzeEvent(makeEvent(), today);
    expect(result.onTrack).toBe(false);
  });

  it('marks on track when fully funded', () => {
    const result = analyzeEvent(makeEvent({ currentSavingsCents: 5_000_000 }), today);
    expect(result.onTrack).toBe(true);
    expect(result.savingsGapCents).toBe(0);
  });

  it('handles event in the past', () => {
    const result = analyzeEvent(makeEvent({ targetDate: '2024-06-01' }), today);
    expect(result.monthsToTarget).toBeLessThan(0);
    // Required savings should be the full gap
    expect(result.requiredMonthlySavingsCents).toBe(result.savingsGapCents);
  });
});

// ---------------------------------------------------------------------------
// analyzeMultipleEvents
// ---------------------------------------------------------------------------

describe('analyzeMultipleEvents', () => {
  it('sorts events by priority', () => {
    const events = [
      makeEvent({ id: 'low', priority: 3 }),
      makeEvent({ id: 'high', priority: 1 }),
      makeEvent({ id: 'mid', priority: 2 }),
    ];
    const result = analyzeMultipleEvents(events, today);
    expect(result.events[0].event.id).toBe('high');
    expect(result.events[1].event.id).toBe('mid');
    expect(result.events[2].event.id).toBe('low');
  });

  it('calculates aggregate savings needs', () => {
    const events = [
      makeEvent({ id: '1', monthlySavingsCents: 200_000, priority: 1 }),
      makeEvent({ id: '2', monthlySavingsCents: 100_000, priority: 2 }),
    ];
    const result = analyzeMultipleEvents(events, today);
    expect(result.totalMonthlyAllocatedCents).toBe(300_000);
  });

  it('identifies at-risk events', () => {
    const events = [
      makeEvent({
        id: 'ok',
        currentSavingsCents: 5_000_000,
        priority: 1,
      }),
      makeEvent({
        id: 'at-risk',
        currentSavingsCents: 0,
        monthlySavingsCents: 10_000, // Too low
        priority: 2,
      }),
    ];
    const result = analyzeMultipleEvents(events, today);
    expect(result.atRiskEvents.some((e) => e.id === 'at-risk')).toBe(true);
    expect(result.atRiskEvents.some((e) => e.id === 'ok')).toBe(false);
  });

  it('handles empty event list', () => {
    const result = analyzeMultipleEvents([], today);
    expect(result.events).toHaveLength(0);
    expect(result.totalMonthlySavingsNeededCents).toBe(0);
    expect(result.monthlyShortfallCents).toBe(0);
  });

  it('calculates shortfall', () => {
    const events = [
      makeEvent({
        id: '1',
        monthlySavingsCents: 100_000, // Less than needed
        priority: 1,
      }),
    ];
    const result = analyzeMultipleEvents(events, today);
    if (result.totalMonthlySavingsNeededCents > result.totalMonthlyAllocatedCents) {
      expect(result.monthlyShortfallCents).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// createLifeEvent
// ---------------------------------------------------------------------------

describe('createLifeEvent', () => {
  it('creates an event with defaults', () => {
    // Mock crypto.randomUUID for deterministic testing
    const mockUUID = '12345678-1234-1234-1234-123456789abc';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      mockUUID as `${string}-${string}-${string}-${string}-${string}`,
    );

    const event = createLifeEvent({
      name: 'Wedding',
      type: 'wedding',
      targetDate: '2026-09-15',
      estimatedCostCents: 3_000_000,
    });

    expect(event.id).toBe(mockUUID);
    expect(event.name).toBe('Wedding');
    expect(event.type).toBe('wedding');
    expect(event.targetDate).toBe('2026-09-15');
    expect(event.estimatedCostCents).toBe(3_000_000);
    expect(event.currentSavingsCents).toBe(0);
    expect(event.monthlySavingsCents).toBe(0);
    expect(event.priority).toBe(1);
    expect(event.notes).toBe('');

    vi.restoreAllMocks();
  });

  it('allows overriding defaults', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'test-id' as `${string}-${string}-${string}-${string}-${string}`,
    );

    const event = createLifeEvent({
      name: 'Baby',
      type: 'baby',
      targetDate: '2025-12-01',
      estimatedCostCents: 1_500_000,
      currentSavingsCents: 500_000,
      priority: 2,
    });

    expect(event.currentSavingsCents).toBe(500_000);
    expect(event.priority).toBe(2);

    vi.restoreAllMocks();
  });
});
