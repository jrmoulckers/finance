// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildLocaleCompletenessReport, canExposeLocaleInProduct, createPseudolocalePack } from './catalog-workflow';
import { LOCALE_PACKS } from './locale-packs';

describe('catalog-workflow', () => {
  it('reports missing and obsolete catalog IDs for locale workflow checks', () => {
    expect(buildLocaleCompletenessReport('es-ES', { a: 'A', b: 'B' }, { a: 'Uno', c: 'Tres' })).toEqual({
      locale: 'es-ES',
      missing: ['b'],
      obsolete: ['c'],
      completionRatio: 0.5,
      activationAllowed: false,
    });
  });

  it('keeps fallback-only packs unavailable and generates pseudolocalized packs', () => {
    const report = buildLocaleCompletenessReport('fr-CA', {}, {});
    expect(canExposeLocaleInProduct('fallback-only', report)).toBe(false);
    expect(createPseudolocalePack(LOCALE_PACKS['en-US']).messages['settings.language']).toBe('[!! Láñgúágé !!]');
  });
});
