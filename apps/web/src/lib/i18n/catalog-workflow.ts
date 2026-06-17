// SPDX-License-Identifier: BUSL-1.1

import { pseudolocalizeCatalog, type MessageCatalog } from './catalog-loader';
import type { LocalePack, LocalePackStatus } from './locale-packs';

export interface LocaleCompletenessWorkflowReport {
  readonly locale: string;
  readonly missing: readonly string[];
  readonly obsolete: readonly string[];
  readonly completionRatio: number;
  readonly activationAllowed: boolean;
}

export function buildLocaleCompletenessReport(
  locale: string,
  sourceCatalog: MessageCatalog,
  localeCatalog: MessageCatalog,
): LocaleCompletenessWorkflowReport {
  const sourceIds = Object.keys(sourceCatalog).sort();
  const localeIds = Object.keys(localeCatalog).sort();
  const localeIdSet = new Set(localeIds);
  const sourceIdSet = new Set(sourceIds);
  const missing = sourceIds.filter((id) => !localeIdSet.has(id));
  const obsolete = localeIds.filter((id) => !sourceIdSet.has(id));
  const completionRatio = sourceIds.length === 0 ? 1 : (sourceIds.length - missing.length) / sourceIds.length;

  return {
    locale,
    missing,
    obsolete,
    completionRatio,
    activationAllowed: missing.length === 0 && obsolete.length === 0,
  };
}

export function canExposeLocaleInProduct(status: LocalePackStatus, report: LocaleCompletenessWorkflowReport): boolean {
  return status !== 'fallback-only' && report.activationAllowed;
}

export function createPseudolocalePack(source: LocalePack, locale = 'en-XA'): LocalePack {
  return {
    locale,
    nativeName: 'Pseudo',
    status: 'fallback-only',
    fallbackLocale: source.locale,
    translatorNotes: [
      'Generated pseudolocale for expansion and clipping checks; never expose as a production locale.',
      ...source.translatorNotes,
    ],
    messages: pseudolocalizeCatalog(source.messages),
  };
}
