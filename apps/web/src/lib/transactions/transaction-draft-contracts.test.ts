// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildTransactionDraft, privacySafeParseFailure } from './transaction-draft-contracts';

const merchants = [{ id: 'm1', name: 'Starbucks', aliases: ['sbux'] }];
const categories = [{ id: 'c1', name: 'Coffee', aliases: ['cafe'] }];
const accounts = [{ id: 'a1', name: 'Checking', aliases: ['main'] }];

describe('transaction draft contracts', () => {
  it('maps merchant, category, and account entities into a confirmable draft', () => {
    expect(
      buildTransactionDraft(
        {
          phrase: 'coffee at sbux from main',
          amountCents: 525,
          merchant: 'sbux',
          category: 'cafe',
          account: 'main',
          date: '2026-04-10',
          offline: false,
        },
        merchants,
        categories,
        accounts,
      ),
    ).toMatchObject({
      merchantId: 'm1',
      categoryId: 'c1',
      accountId: 'a1',
      confidence: 1,
      requiresConfirmation: false,
    });
  });

  it('surfaces ambiguity, missing fields, offline confirmation, and privacy-safe failures', () => {
    const draft = buildTransactionDraft(
      {
        phrase: 'lunch',
        amountCents: null,
        merchant: 'unknown',
        category: null,
        account: null,
        date: null,
        offline: true,
      },
      merchants,
      categories,
      accounts,
    );
    expect(draft.ambiguities).toEqual(['merchant']);
    expect(draft.validationErrors).toContain('missing-amount');
    expect(draft.requiresConfirmation).toBe(true);
    expect(privacySafeParseFailure('unsupported-language')).toEqual({
      validationErrors: ['unsupported-language'],
      requiresConfirmation: true,
      confidence: 0,
    });
  });
});
