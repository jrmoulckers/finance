// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the free-trial expiry tracking engine.
 *
 * Covers: date arithmetic, urgency classification, trial tracking,
 * batch tracking, reminder filtering, and auto-renewal risk calculation.
 *
 * Edge cases: expired trials, trials ending today, no trial info,
 * trials without auto-renewal, zero-cost post-trial price.
 *
 * References: issues #1601, #1619
 */

import { describe, expect, it } from 'vitest';
import {
  addDays,
  calculateAutoRenewalRisk,
  classifyUrgency,
  daysBetween,
  getTrialsNeedingReminder,
  trackAllTrials,
  trackTrial,
} from './trial-tracker';
import type { Subscription } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'Trial Service',
    priceCents: 0,
    billingCycle: 'monthly',
    category: 'software',
    status: 'trial',
    startDate: '2025-01-01',
    nextBillingDate: '2025-02-01',
    provider: 'TrialCo',
    priceHistory: [],
    trial: {
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      autoRenews: true,
      postTrialPriceCents: 999,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns positive days for future date', () => {
    expect(daysBetween('2025-01-01', '2025-01-10')).toBe(9);
  });

  it('returns negative days for past date', () => {
    expect(daysBetween('2025-01-10', '2025-01-01')).toBe(-9);
  });

  it('returns 0 for same date', () => {
    expect(daysBetween('2025-01-15', '2025-01-15')).toBe(0);
  });

  it('handles month boundaries', () => {
    expect(daysBetween('2025-01-28', '2025-02-03')).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// addDays
// ---------------------------------------------------------------------------

describe('addDays', () => {
  it('adds days correctly', () => {
    expect(addDays('2025-01-01', 10)).toBe('2025-01-11');
  });

  it('subtracts days with negative value', () => {
    expect(addDays('2025-01-10', -3)).toBe('2025-01-07');
  });

  it('crosses month boundaries', () => {
    expect(addDays('2025-01-30', 3)).toBe('2025-02-02');
  });

  it('handles zero days', () => {
    expect(addDays('2025-06-15', 0)).toBe('2025-06-15');
  });
});

// ---------------------------------------------------------------------------
// classifyUrgency
// ---------------------------------------------------------------------------

describe('classifyUrgency', () => {
  it('returns expired for 0 days', () => {
    expect(classifyUrgency(0)).toBe('expired');
  });

  it('returns expired for negative days', () => {
    expect(classifyUrgency(-5)).toBe('expired');
  });

  it('returns high for 1-3 days', () => {
    expect(classifyUrgency(1)).toBe('high');
    expect(classifyUrgency(3)).toBe('high');
  });

  it('returns medium for 4-7 days', () => {
    expect(classifyUrgency(4)).toBe('medium');
    expect(classifyUrgency(7)).toBe('medium');
  });

  it('returns low for 8-14 days', () => {
    expect(classifyUrgency(8)).toBe('low');
    expect(classifyUrgency(14)).toBe('low');
  });

  it('returns none for 15+ days', () => {
    expect(classifyUrgency(15)).toBe('none');
    expect(classifyUrgency(30)).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// trackTrial
// ---------------------------------------------------------------------------

describe('trackTrial', () => {
  it('tracks an active trial with days remaining', () => {
    const sub = makeSub();
    const result = trackTrial(sub, '2025-01-15');

    expect(result).not.toBeNull();
    expect(result!.subscriptionId).toBe('sub-1');
    expect(result!.totalDays).toBe(30);
    expect(result!.daysRemaining).toBe(16);
    expect(result!.isExpired).toBe(false);
    expect(result!.autoRenewRisk).toBe(true);
    expect(result!.urgency).toBe('none');
  });

  it('tracks an expired trial', () => {
    const sub = makeSub();
    const result = trackTrial(sub, '2025-02-15');

    expect(result).not.toBeNull();
    expect(result!.daysRemaining).toBe(0);
    expect(result!.isExpired).toBe(true);
    expect(result!.autoRenewRisk).toBe(false); // expired, no risk
    expect(result!.urgency).toBe('expired');
  });

  it('returns null for subscription without trial', () => {
    const sub = makeSub({ trial: undefined });
    expect(trackTrial(sub, '2025-01-15')).toBeNull();
  });

  it('calculates reminder date 3 days before end', () => {
    const sub = makeSub();
    const result = trackTrial(sub, '2025-01-15');
    expect(result!.reminderDate).toBe('2025-01-28');
  });

  it('flags high urgency when 2 days remain', () => {
    const sub = makeSub();
    const result = trackTrial(sub, '2025-01-29');
    expect(result!.daysRemaining).toBe(2);
    expect(result!.urgency).toBe('high');
  });

  it('flags no auto-renew risk when autoRenews is false', () => {
    const sub = makeSub({
      trial: {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        autoRenews: false,
        postTrialPriceCents: 999,
      },
    });
    const result = trackTrial(sub, '2025-01-15');
    expect(result!.autoRenewRisk).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// trackAllTrials
// ---------------------------------------------------------------------------

describe('trackAllTrials', () => {
  it('returns sorted by days remaining (most urgent first)', () => {
    const subs = [
      makeSub({
        id: 'sub-far',
        name: 'Far Trial',
        trial: {
          startDate: '2025-01-01',
          endDate: '2025-03-01',
          autoRenews: true,
          postTrialPriceCents: 999,
        },
      }),
      makeSub({
        id: 'sub-near',
        name: 'Near Trial',
        trial: {
          startDate: '2025-01-01',
          endDate: '2025-01-20',
          autoRenews: true,
          postTrialPriceCents: 499,
        },
      }),
    ];

    const results = trackAllTrials(subs, '2025-01-15');
    expect(results).toHaveLength(2);
    expect(results[0].subscriptionId).toBe('sub-near');
    expect(results[1].subscriptionId).toBe('sub-far');
  });

  it('excludes subscriptions without trials', () => {
    const subs = [makeSub(), makeSub({ id: 'sub-no-trial', trial: undefined })];

    const results = trackAllTrials(subs, '2025-01-15');
    expect(results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getTrialsNeedingReminder
// ---------------------------------------------------------------------------

describe('getTrialsNeedingReminder', () => {
  it('returns trials that are past their reminder date', () => {
    const sub = makeSub(); // ends 2025-01-31, reminder 2025-01-28
    const trials = [trackTrial(sub, '2025-01-29')!];

    const reminders = getTrialsNeedingReminder(trials, '2025-01-29');
    expect(reminders).toHaveLength(1);
  });

  it('excludes expired trials', () => {
    const sub = makeSub();
    const trials = [trackTrial(sub, '2025-02-15')!];

    const reminders = getTrialsNeedingReminder(trials, '2025-02-15');
    expect(reminders).toHaveLength(0);
  });

  it('excludes trials without auto-renewal', () => {
    const sub = makeSub({
      trial: {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        autoRenews: false,
        postTrialPriceCents: 999,
      },
    });
    const trials = [trackTrial(sub, '2025-01-29')!];

    const reminders = getTrialsNeedingReminder(trials, '2025-01-29');
    expect(reminders).toHaveLength(0);
  });

  it('excludes trials before their reminder date', () => {
    const sub = makeSub(); // reminder is 2025-01-28
    const trials = [trackTrial(sub, '2025-01-15')!];

    const reminders = getTrialsNeedingReminder(trials, '2025-01-15');
    expect(reminders).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateAutoRenewalRisk
// ---------------------------------------------------------------------------

describe('calculateAutoRenewalRisk', () => {
  it('sums post-trial prices for auto-renewing trials', () => {
    const subs = [
      makeSub({
        id: 'sub-1',
        trial: {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          autoRenews: true,
          postTrialPriceCents: 999,
        },
      }),
      makeSub({
        id: 'sub-2',
        trial: {
          startDate: '2025-01-01',
          endDate: '2025-02-28',
          autoRenews: true,
          postTrialPriceCents: 1499,
        },
      }),
    ];

    const trials = trackAllTrials(subs, '2025-01-15');
    expect(calculateAutoRenewalRisk(trials)).toBe(2498);
  });

  it('returns 0 when no trials have auto-renewal', () => {
    const sub = makeSub({
      trial: {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        autoRenews: false,
        postTrialPriceCents: 999,
      },
    });

    const trials = trackAllTrials([sub], '2025-01-15');
    expect(calculateAutoRenewalRisk(trials)).toBe(0);
  });

  it('excludes expired trials from risk', () => {
    const sub = makeSub(); // ends 2025-01-31
    const trials = trackAllTrials([sub], '2025-02-15'); // expired
    expect(calculateAutoRenewalRisk(trials)).toBe(0);
  });
});
