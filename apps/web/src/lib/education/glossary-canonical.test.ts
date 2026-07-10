// SPDX-License-Identifier: BUSL-1.1

/**
 * Consumes and validates the canonical financial-terminology glossary
 * (config/i18n/glossary.json) from the web app so terminology drift is caught
 * by the web test suite in addition to the standalone CI validator.
 *
 * References: issue #3318
 */

import { describe, expect, it } from 'vitest';

import canonicalGlossary from '../../../../../config/i18n/glossary.json';
import canonicalLocales from '../../../../../config/i18n/locales.json';

import { financialGlossary } from './glossary';

interface GlossaryTerm {
  concept: string;
  doNotUse?: Record<string, string[]>;
  [locale: string]: unknown;
}

interface CanonicalGlossary {
  sourceLocale: string;
  locales: string[];
  terms: GlossaryTerm[];
}

interface LocaleMeta {
  locales: { id: string; enforced?: boolean }[];
}

const glossary = canonicalGlossary as unknown as CanonicalGlossary;

const localeMeta = canonicalLocales as unknown as LocaleMeta;

describe('canonical financial-terminology glossary (#3318)', () => {
  it('declares a valid locale set with the source locale included', () => {
    expect(Array.isArray(glossary.locales)).toBe(true);
    expect(glossary.locales.length).toBeGreaterThan(0);
    expect(glossary.locales).toContain(glossary.sourceLocale);
  });

  it('supplies a non-blank value for every locale on every concept', () => {
    for (const term of glossary.terms) {
      expect(term.concept, JSON.stringify(term)).toBeTruthy();
      for (const locale of glossary.locales) {
        const value = term[locale];
        expect(typeof value, `${term.concept} / ${locale}`).toBe('string');
        expect((value as string).trim().length, `${term.concept} / ${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it('has unique concept keys', () => {
    const concepts = glossary.terms.map((t) => t.concept);
    expect(new Set(concepts).size).toBe(concepts.length);
  });

  it('never lists a chosen translation in its own doNotUse set', () => {
    for (const term of glossary.terms) {
      if (!term.doNotUse) continue;
      for (const [locale, banned] of Object.entries(term.doNotUse)) {
        const chosen = String(term[locale] ?? '')
          .trim()
          .toLowerCase();
        for (const bad of banned) {
          expect(bad.trim().toLowerCase(), `${term.concept} / ${locale}`).not.toBe(chosen);
        }
      }
    }
  });

  it('covers every enforced locale from config/i18n/locales.json', () => {
    const enforced = localeMeta.locales.filter((l) => l.enforced).map((l) => l.id);
    for (const id of enforced) {
      expect(glossary.locales, `enforced locale ${id}`).toContain(id);
    }
  });

  it('keeps the in-app English glossary wording consistent with canonical terms', () => {
    const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const inAppByCollapsed = new Map<string, string>();
    for (const entry of Object.values(financialGlossary)) {
      inAppByCollapsed.set(collapse(entry.term), entry.term);
    }

    const en = glossary.sourceLocale;
    let overlaps = 0;
    for (const term of glossary.terms) {
      const canonical = String(term[en] ?? '');
      const key = collapse(canonical);
      const inApp = inAppByCollapsed.get(key);
      if (inApp === undefined) continue;
      overlaps += 1;
      // Case/spacing may differ per surface, but the words must match.
      expect(collapse(inApp), term.concept).toBe(key);
    }
    // At least the shared terms (Budget, Net worth, Exchange rate) overlap.
    expect(overlaps).toBeGreaterThan(0);
  });
});
