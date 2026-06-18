// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import {
  createCatalogTranslator,
  interpolateTemplate,
  pseudolocalizeCatalog,
  resolveCatalogLocale,
} from './catalog-loader';

const catalogs = {
  'en-US': {
    greeting: 'Hello, {name}',
    itemCount: {
      one: '{count} item',
      other: '{count} items',
    },
  },
  'es-ES': {
    greeting: 'Hola, {name}',
  },
};

describe('catalog-loader', () => {
  it('resolves exact and language-level locale catalogs', () => {
    expect(resolveCatalogLocale('es-MX', catalogs, 'en-US')).toBe('es-ES');
    expect(resolveCatalogLocale('fr-CA', catalogs, 'en-US')).toBe('en-US');
  });

  it('interpolates placeholders and reports missing values', () => {
    expect(interpolateTemplate('Hello, {name} from {place}', { name: 'Ana' })).toEqual({
      text: 'Hello, Ana from {place}',
      missingValues: ['place'],
    });
  });

  it('translates with fallback diagnostics', () => {
    const onMissingMessage = vi.fn();
    const translator = createCatalogTranslator({
      defaultLocale: 'en-US',
      catalogs,
      onMissingMessage,
    });

    expect(translator.translate('greeting', { name: 'Ana' }, 'es-ES')).toMatchObject({
      text: 'Hola, Ana',
      translated: true,
      locale: 'es-ES',
    });
    expect(translator.translate('itemCount', { count: 2 }, 'es-ES')).toMatchObject({
      text: '2 items',
      translated: false,
    });
    expect(onMissingMessage).toHaveBeenCalledWith('itemCount', 'es-ES');
  });

  it('selects plural forms by count', () => {
    const translator = createCatalogTranslator({ defaultLocale: 'en-US', catalogs });

    expect(translator.translate('itemCount', { count: 1 }).text).toBe('1 item');
    expect(translator.translate('itemCount', { count: 5 }).text).toBe('5 items');
  });

  it('reports locale completeness and pseudolocalizes source copy', () => {
    const translator = createCatalogTranslator({ defaultLocale: 'en-US', catalogs });
    expect(translator.completeness('es-ES')).toMatchObject({
      missing: ['itemCount'],
      obsolete: [],
      completionRatio: 0.5,
    });
    expect(pseudolocalizeCatalog({ save: 'Save' })).toEqual({ save: '[!! Sávé !!]' });
  });
});
