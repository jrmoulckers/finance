// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { redactShareCard } from './share-card-redaction';

describe('share card redaction rules', () => {
  it('hides sensitive balances and account names for amount-hidden cards', () => {
    expect(
      redactShareCard(
        {
          type: 'goal-milestone',
          title: 'Emergency fund',
          nickname: 'Jay',
          amountCents: 5000_00,
          percentComplete: 50,
          accountName: 'Checking 1234',
        },
        'amount-hidden',
      ),
    ).toEqual({
      title: 'Emergency fund',
      displayName: 'Jay',
      amountCents: null,
      percentComplete: 50,
      accountName: null,
      householdName: null,
    });
  });

  it('uses percent-only and private-household redactions without leaking balances', () => {
    expect(
      redactShareCard(
        {
          type: 'streak-milestone',
          title: 'Saving streak',
          nickname: 'J',
          amountCents: 99_00,
          percentComplete: 80,
          householdName: 'Home',
        },
        'percent-only',
      ).amountCents,
    ).toBeNull();
    expect(
      redactShareCard(
        {
          type: 'badge-unlock',
          title: 'Badge',
          nickname: 'J',
          amountCents: 99_00,
          householdName: 'Home',
        },
        'private-household',
      ).householdName,
    ).toBeNull();
  });
});
