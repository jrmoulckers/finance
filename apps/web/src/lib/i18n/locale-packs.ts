// SPDX-License-Identifier: BUSL-1.1

import type { MessageCatalog } from './catalog-loader';
import { LOCALE_REGISTRY, getLocaleRegistryEntry, type LocalePackStatus } from './locale-registry';

export type { LocalePackStatus } from './locale-registry';

export interface LocalePack {
  readonly locale: string;
  readonly nativeName: string;
  readonly status: LocalePackStatus;
  readonly fallbackLocale: string;
  readonly translatorNotes: readonly string[];
  readonly messages: MessageCatalog;
}

function toPack(entry: (typeof LOCALE_REGISTRY)[number]): LocalePack {
  return {
    locale: entry.code,
    nativeName: entry.nativeLabel,
    status: entry.status,
    fallbackLocale: entry.fallbackLocale,
    translatorNotes: entry.translatorNotes,
    messages: entry.messages,
  };
}

/**
 * Translation catalogs, derived from the single locale source of truth in
 * `locale-registry.ts` (issue #3314). Every selectable switcher locale has a
 * matching pack here and vice versa — the two web lists can no longer diverge.
 */
export const LOCALE_PACKS: Readonly<Record<string, LocalePack>> = Object.freeze(
  Object.fromEntries(LOCALE_REGISTRY.map((entry) => [entry.code, toPack(entry)])),
);

export function getLocalePack(locale: string): LocalePack | null {
  const entry = getLocaleRegistryEntry(locale);
  return entry ? toPack(entry) : null;
}

export function getActiveCatalogs(): Readonly<Record<string, MessageCatalog>> {
  return Object.fromEntries(
    Object.entries(LOCALE_PACKS).map(([locale, pack]) => [locale, pack.messages]),
  );
}
