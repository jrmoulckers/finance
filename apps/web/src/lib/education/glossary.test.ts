// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the plain-language financial glossary, including the cross-border
 * remittance and exchange-rate terms a bilingual remitter needs.
 *
 * References: issue #3316
 */

import { describe, expect, it } from 'vitest';

import { financialGlossary, getGlossaryEntry } from './glossary';
import { GLOSSARY_KEYS } from './types';

describe('financial glossary', () => {
  it('defines a complete, well-formed entry for every glossary key', () => {
    for (const key of GLOSSARY_KEYS) {
      const entry = financialGlossary[key];
      expect(entry, key).toBeDefined();
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(0);
      expect(entry.example.length).toBeGreaterThan(0);
      expect(entry.whyItMatters.length).toBeGreaterThan(0);
    }
  });

  it('covers the remittance and FX terms an immigrant remitter needs (#3316)', () => {
    const remittanceTerms = [
      'exchangeRate',
      'midMarketRate',
      'fxMargin',
      'remittance',
      'wireTransfer',
    ] as const;
    for (const key of remittanceTerms) {
      expect(GLOSSARY_KEYS).toContain(key);
      expect(getGlossaryEntry(key).term.length).toBeGreaterThan(0);
    }
  });

  it('explains FX margin in terms of the mid-market reference rate', () => {
    expect(getGlossaryEntry('fxMargin').definition.toLowerCase()).toContain('mid-market');
  });
});
