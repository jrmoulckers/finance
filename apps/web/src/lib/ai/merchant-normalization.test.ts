// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  learnMerchantAlias,
  normalizeMerchantName,
  stripMerchantNoise,
} from './merchant-normalization';

describe('normalizeMerchantName', () => {
  it('normalizes store numbers and location suffixes to seeded merchants', () => {
    const result = normalizeMerchantName('POS WALMART STORE #04231 PHOENIX AZ');

    expect(result).toMatchObject({ canonicalName: 'Walmart', source: 'seeded-pattern' });
    expect(result!.confidence).toBeGreaterThan(0.75);
    expect(result!.explanation).toContain('bank noise');
  });

  it('removes processor prefixes such as SQ and TST', () => {
    expect(stripMerchantNoise('SQ *STARBUCKS 000123 SEATTLE WA')).toBe('starbucks');
    expect(stripMerchantNoise('TST- COSTCO WHOLESALE 9876 AUSTIN TX')).toBe('costco wholesale');
  });

  it('prefers learned aliases with metadata', () => {
    const result = normalizeMerchantName('PAYPAL *ACMEFOODS 8833', [
      {
        rawAlias: 'acmefoods',
        canonicalName: 'Acme Foods',
        displayName: 'Acme Foods Market',
        categoryHint: 'Groceries',
        matchCount: 6,
      },
    ]);

    expect(result).toMatchObject({
      canonicalName: 'Acme Foods',
      displayName: 'Acme Foods Market',
      source: 'learned-alias',
      categoryHint: 'Groceries',
    });
    expect(result!.confidence).toBeGreaterThan(0.9);
  });

  it('returns a readable noise-stripped fallback without overwriting explicit names', () => {
    const result = normalizeMerchantName('DEBIT CARD NEIGHBORHOOD BOOKS 4382 PORTLAND OR');

    expect(result).toMatchObject({ canonicalName: 'Neighborhood Books', source: 'noise-stripped' });
    expect(result!.confidence).toBeGreaterThan(0.5);
  });
});

describe('learnMerchantAlias', () => {
  it('maintains local alias mappings learned from user renames', () => {
    const aliases = learnMerchantAlias('POS SBUX 1234 SEATTLE WA', 'Starbucks', [], {
      categoryHint: 'Dining',
    });

    expect(aliases).toEqual([
      {
        rawAlias: 'sbux',
        canonicalName: 'Starbucks',
        displayName: undefined,
        categoryHint: 'Dining',
        matchCount: 1,
      },
    ]);
  });
});
