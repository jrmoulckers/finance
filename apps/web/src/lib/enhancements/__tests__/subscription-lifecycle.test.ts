import { describe, it, expect } from 'vitest';
import {
  createSubscription,
  isValidTransition,
  transitionState,
  pauseSubscription,
  archiveSubscription,
  calculateMonthlySavings,
  getLifecycleHistory,
  filterByState,
  isReadyToResume,
} from '../subscription-lifecycle';
import type { SubscriptionLifecycle } from '../types';

describe('subscription-lifecycle', () => {
  const makeSub = (overrides?: Partial<SubscriptionLifecycle>): SubscriptionLifecycle => ({
    ...createSubscription('sub-1', 'Netflix', 1599),
    ...overrides,
  });

  describe('isValidTransition', () => {
    it('allows active → paused', () => {
      expect(isValidTransition('active', 'paused')).toBe(true);
    });

    it('allows active → cancelled', () => {
      expect(isValidTransition('active', 'cancelled')).toBe(true);
    });

    it('allows paused → active', () => {
      expect(isValidTransition('paused', 'active')).toBe(true);
    });

    it('allows cancelled → archived', () => {
      expect(isValidTransition('cancelled', 'archived')).toBe(true);
    });

    it('rejects active → archived', () => {
      expect(isValidTransition('active', 'archived')).toBe(false);
    });

    it('rejects archived → anything', () => {
      expect(isValidTransition('archived', 'active')).toBe(false);
      expect(isValidTransition('archived', 'paused')).toBe(false);
    });
  });

  describe('transitionState', () => {
    it('transitions and records history', () => {
      const sub = makeSub();
      const result = transitionState(sub, 'paused', '2025-01-15T00:00:00Z', 'Saving money');
      expect(result).not.toBeNull();
      expect(result!.state).toBe('paused');
      expect(result!.history).toHaveLength(1);
      expect(result!.history[0]).toEqual({
        from: 'active',
        to: 'paused',
        timestamp: '2025-01-15T00:00:00Z',
        reason: 'Saving money',
      });
    });

    it('returns null for invalid transition', () => {
      const sub = makeSub();
      expect(transitionState(sub, 'archived', '2025-01-15T00:00:00Z')).toBeNull();
    });
  });

  describe('pauseSubscription', () => {
    it('pauses with resume date', () => {
      const sub = makeSub();
      const result = pauseSubscription(sub, '2025-01-15T00:00:00Z', '2025-03-15');
      expect(result).not.toBeNull();
      expect(result!.state).toBe('paused');
      expect(result!.resumeDate).toBe('2025-03-15');
    });

    it('returns null when already paused trying to pause again', () => {
      const sub = makeSub({ state: 'paused' });
      expect(pauseSubscription(sub, '2025-01-15T00:00:00Z')).toBeNull();
    });
  });

  describe('archiveSubscription', () => {
    it('archives cancelled subscription with retention', () => {
      const sub = makeSub({ state: 'cancelled' });
      const result = archiveSubscription(sub, '2025-01-15T00:00:00Z', 180);
      expect(result).not.toBeNull();
      expect(result!.state).toBe('archived');
      expect(result!.archivedDate).toBe('2025-01-15T00:00:00Z');
      expect(result!.retentionDays).toBe(180);
    });

    it('uses default 90 day retention', () => {
      const sub = makeSub({ state: 'cancelled' });
      const result = archiveSubscription(sub, '2025-01-15T00:00:00Z');
      expect(result!.retentionDays).toBe(90);
    });
  });

  describe('calculateMonthlySavings', () => {
    it('sums paused and cancelled subscription costs', () => {
      const subs = [
        makeSub({ monthlyCostCents: 1599, state: 'active' }),
        makeSub({ monthlyCostCents: 999, state: 'paused' }),
        makeSub({ monthlyCostCents: 1299, state: 'cancelled' }),
        makeSub({ monthlyCostCents: 499, state: 'archived' }),
      ];
      expect(calculateMonthlySavings(subs)).toBe(999 + 1299);
    });

    it('returns 0 for empty array', () => {
      expect(calculateMonthlySavings([])).toBe(0);
    });
  });

  describe('filterByState', () => {
    it('filters by state', () => {
      const subs = [
        makeSub({ id: '1', state: 'active' }),
        makeSub({ id: '2', state: 'paused' }),
        makeSub({ id: '3', state: 'active' }),
      ];
      expect(filterByState(subs, 'active')).toHaveLength(2);
    });
  });

  describe('isReadyToResume', () => {
    it('returns true when current date >= resume date', () => {
      const sub = makeSub({ state: 'paused', resumeDate: '2025-03-01' });
      expect(isReadyToResume(sub, '2025-03-01')).toBe(true);
      expect(isReadyToResume(sub, '2025-03-15')).toBe(true);
    });

    it('returns false when not paused', () => {
      const sub = makeSub({ state: 'active', resumeDate: '2025-03-01' });
      expect(isReadyToResume(sub, '2025-03-15')).toBe(false);
    });

    it('returns false when no resume date', () => {
      const sub = makeSub({ state: 'paused' });
      expect(isReadyToResume(sub, '2025-03-15')).toBe(false);
    });
  });

  describe('getLifecycleHistory', () => {
    it('returns the history array', () => {
      const sub = makeSub({
        history: [{ from: 'active', to: 'paused', timestamp: '2025-01-01T00:00:00Z' }],
      });
      expect(getLifecycleHistory(sub)).toHaveLength(1);
    });
  });

  describe('createSubscription', () => {
    it('creates active subscription with integer cents', () => {
      const sub = createSubscription('id-1', 'Spotify', 999);
      expect(sub.state).toBe('active');
      expect(sub.monthlyCostCents).toBe(999);
      expect(sub.history).toHaveLength(0);
    });
  });
});
