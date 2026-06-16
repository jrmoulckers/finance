// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createCatalogTranslator } from './catalog-loader';
import { getActiveCatalogs, getLocalePack, LOCALE_PACKS } from './locale-packs';

describe('locale-packs', () => {
  it('ships Spanish starter copy for beta currency-rate settings', () => {
    const translator = createCatalogTranslator({
      defaultLocale: 'en-US',
      catalogs: getActiveCatalogs(),
    });

    expect(translator.translate('settings.currencyRates.title', {}, 'es-ES')).toMatchObject({
      text: 'Tipos de cambio',
      translated: true,
    });
  });

  it('defines fallback-only starter packs for additional candidate locales', () => {
    expect(getLocalePack('fr-CA')).toMatchObject({ status: 'fallback-only', fallbackLocale: 'en-US' });
    expect(getLocalePack('ar')).toMatchObject({ status: 'fallback-only', fallbackLocale: 'en-US' });
    expect(LOCALE_PACKS['ar']?.translatorNotes.join(' ')).toContain('RTL');
  });
});
