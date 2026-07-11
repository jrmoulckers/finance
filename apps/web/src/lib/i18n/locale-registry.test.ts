// SPDX-License-Identifier: BUSL-1.1

/**
 * Drift guard for the web locale source of truth (issue #3314).
 *
 * The web app now derives both its language switcher (`SUPPORTED_LOCALES`) and
 * its translation catalogs (`LOCALE_PACKS`) from a single `LOCALE_REGISTRY`.
 * These tests assert the two web projections stay consistent with each other
 * and with the canonical cross-platform contract in `config/i18n/locales.json`
 * — so the three lists that used to disagree can no longer silently drift.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCALE_PACKS } from './locale-packs';
import { LOCALE_REGISTRY, SELECTABLE_LOCALE_ENTRIES } from './locale-registry';
import { SUPPORTED_LOCALES } from '../i18n';

interface CanonicalLocale {
  readonly id: string;
  readonly enforced?: boolean;
  readonly rtl?: boolean;
}

interface CanonicalCatalog {
  readonly locales: readonly CanonicalLocale[];
}

function resolveRepoFile(relative: string): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, relative);
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error(`Could not locate ${relative} from ${process.cwd()}`);
}

function loadCanonicalCatalog(): CanonicalCatalog {
  const path = resolveRepoFile(join('config', 'i18n', 'locales.json'));
  return JSON.parse(readFileSync(path, 'utf8')) as CanonicalCatalog;
}

describe('locale source of truth', () => {
  it('derives SUPPORTED_LOCALES from the selectable registry entries', () => {
    expect(SUPPORTED_LOCALES.map((locale) => locale.code)).toEqual(
      SELECTABLE_LOCALE_ENTRIES.map((entry) => entry.code),
    );
  });

  it('ships exactly one pack per registry entry (no unselectable orphans mismatch)', () => {
    expect(Object.keys(LOCALE_PACKS).sort()).toEqual(
      LOCALE_REGISTRY.map((entry) => entry.code).sort(),
    );
  });

  it('offers every selectable locale as a pack and every pack code in the registry', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_PACKS[locale.code]).toBeDefined();
    }
  });

  it('covers every enforced canonical locale from config/i18n/locales.json', () => {
    const canonical = loadCanonicalCatalog();
    const selectableCodes = new Set(SELECTABLE_LOCALE_ENTRIES.map((entry) => entry.code));
    const enforced = canonical.locales.filter((locale) => locale.enforced);

    expect(enforced.length).toBeGreaterThan(0);
    for (const locale of enforced) {
      expect(selectableCodes.has(locale.id)).toBe(true);
    }
  });

  it('agrees with the canonical contract on text direction for shared locales', () => {
    const canonical = loadCanonicalCatalog();
    const canonicalById = new Map(canonical.locales.map((locale) => [locale.id, locale]));

    for (const entry of LOCALE_REGISTRY) {
      const match = canonicalById.get(entry.code);
      if (!match) continue;
      const expected = match.rtl ? 'rtl' : 'ltr';
      expect(entry.textDirection).toBe(expected);
    }
  });
});
