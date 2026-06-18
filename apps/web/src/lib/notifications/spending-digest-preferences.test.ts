// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';
import {
  enabledDigestCadences,
  normalizeSpendingDigestPreferences,
  planSpendingDigestSchedules,
} from './spending-digest-preferences';

describe('spending digest preferences', () => {
  it('supports weekly, monthly, both, and off cadence choices', () => {
    expect(enabledDigestCadences(normalizeSpendingDigestPreferences({ cadence: 'both' }))).toEqual([
      'weekly',
      'monthly',
    ]);
    expect(enabledDigestCadences(normalizeSpendingDigestPreferences({ cadence: 'off' }))).toEqual(
      [],
    );
  });

  it('plans due digest delivery and records history entries', () => {
    const [decision] = planSpendingDigestSchedules(
      [{ cadence: 'weekly', periodStart: '2025-04-01', periodEnd: '2025-04-07' }],
      { cadence: 'weekly' },
      DEFAULT_NOTIFICATION_PREFERENCES,
      [],
    );

    expect(decision?.due).toBe(true);
    expect(decision?.notification?.type).toBe('spending_digest');
    expect(decision?.historyEntry?.periodEnd).toBe('2025-04-07');
  });

  it('skips already delivered digest periods', () => {
    const input = {
      cadence: 'monthly' as const,
      periodStart: '2025-04-01',
      periodEnd: '2025-04-30',
    };
    const [first] = planSpendingDigestSchedules(
      [input],
      { cadence: 'monthly' },
      DEFAULT_NOTIFICATION_PREFERENCES,
      [],
    );
    const [second] = planSpendingDigestSchedules(
      [input],
      { cadence: 'monthly' },
      DEFAULT_NOTIFICATION_PREFERENCES,
      first?.historyEntry ? [first.historyEntry] : [],
    );

    expect(second?.reason).toBe('already_delivered');
  });
});
