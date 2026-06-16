// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { rankPayeeSuggestions, type PayeeHistoryEntry } from './payee-suggestions';

const HISTORY: PayeeHistoryEntry[] = [
  { payee: 'Starbucks', date: '2025-03-01', accountId: 'checking', categoryId: 'dining' },
  { payee: 'Starbucks', date: '2025-02-15', accountId: 'checking', categoryId: 'dining', correctedFrom: 'SBUX 1234' },
  { payee: 'Staples', date: '2025-03-03', accountId: 'business', categoryId: 'office' },
  { payee: 'Costco', date: '2024-09-01', accountId: 'checking', categoryId: 'groceries' },
];

describe('rankPayeeSuggestions', () => {
  it('ranks by prefix, recency, frequency, account, and category context', () => {
    const suggestions = rankPayeeSuggestions('sta', HISTORY, [], {
      accountId: 'checking',
      categoryId: 'dining',
      now: new Date('2025-03-10T00:00:00.000Z'),
    });

    expect(suggestions[0]).toMatchObject({ payee: 'Starbucks', source: 'history' });
    expect(suggestions[0].confidence).toBeGreaterThan(0.9);
    expect(suggestions[0].explanation).toContain('same account');
    expect(suggestions[0].ariaLabel).toBe('Use payee Starbucks');
  });

  it('uses normalized alias matches for noisy partial tokens', () => {
    const suggestions = rankPayeeSuggestions('sbux', HISTORY, [{ alias: 'SBUX', canonicalPayee: 'Starbucks' }], {
      now: new Date('2025-03-10T00:00:00.000Z'),
    });

    expect(suggestions[0]).toMatchObject({ payee: 'Starbucks', source: 'alias' });
    expect(suggestions[0].explanation).toContain('normalized alias match');
  });

  it('respects local privacy settings and can limit results', () => {
    expect(rankPayeeSuggestions('a', HISTORY, [], { privacyEnabled: false })).toEqual([]);
    expect(rankPayeeSuggestions('', HISTORY, [], { limit: 2 })).toHaveLength(2);
  });
});
