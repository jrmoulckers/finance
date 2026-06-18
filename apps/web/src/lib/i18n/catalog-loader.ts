// SPDX-License-Identifier: BUSL-1.1

export type MessageValue = string | number | boolean | Date;
export type MessageValues = Readonly<Record<string, MessageValue>>;
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export interface PluralMessage {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

export type CatalogMessage = string | PluralMessage;
export type MessageCatalog = Readonly<Record<string, CatalogMessage>>;

export interface CatalogCompleteness {
  readonly locale: string;
  readonly missing: readonly string[];
  readonly obsolete: readonly string[];
  readonly completionRatio: number;
}

export interface TranslateResult {
  readonly messageId: string;
  readonly requestedLocale: string;
  readonly locale: string;
  readonly text: string;
  readonly translated: boolean;
  readonly missingValues: readonly string[];
}

export interface CatalogTranslatorOptions {
  readonly defaultLocale: string;
  readonly catalogs: Readonly<Record<string, MessageCatalog>>;
  readonly onMissingMessage?: (messageId: string, locale: string) => void;
}

export interface CatalogTranslator {
  readonly defaultLocale: string;
  readonly catalogs: Readonly<Record<string, MessageCatalog>>;
  translate: (messageId: string, values?: MessageValues, locale?: string) => TranslateResult;
  completeness: (locale: string) => CatalogCompleteness;
}

const PSEUDO_ACCENTS: Readonly<Record<string, string>> = {
  a: 'á',
  A: 'Á',
  e: 'é',
  E: 'É',
  i: 'í',
  I: 'Í',
  o: 'ó',
  O: 'Ó',
  u: 'ú',
  U: 'Ú',
  c: 'ç',
  C: 'Ç',
  n: 'ñ',
  N: 'Ñ',
};

function canonicalizeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    return locale;
  }
}

function hasOwnMessage(catalog: MessageCatalog | undefined, messageId: string): boolean {
  return Object.prototype.hasOwnProperty.call(catalog, messageId);
}

export function resolveCatalogLocale(
  requestedLocale: string,
  catalogs: Readonly<Record<string, MessageCatalog>>,
  defaultLocale: string,
): string {
  const canonical = canonicalizeLocale(requestedLocale);
  if (catalogs[canonical]) return canonical;

  const language = canonical.split('-')[0]?.toLowerCase();
  const languageMatch = Object.keys(catalogs).find(
    (candidate) =>
      candidate.toLowerCase() === language || candidate.toLowerCase().startsWith(`${language}-`),
  );

  return languageMatch ?? defaultLocale;
}

function isPluralMessage(message: CatalogMessage): message is PluralMessage {
  return typeof message !== 'string';
}

function selectTemplate(message: CatalogMessage, values: MessageValues, locale: string): string {
  if (!isPluralMessage(message)) return message;

  const count = values.count;
  if (typeof count !== 'number') return message.other;

  const pluralCategory = new Intl.PluralRules(locale).select(count) as PluralCategory;
  return message[pluralCategory] ?? message.other;
}

export function interpolateTemplate(
  template: string,
  values: MessageValues = {},
): { readonly text: string; readonly missingValues: readonly string[] } {
  const missingValues = new Set<string>();
  const text = template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) {
      missingValues.add(key);
      return placeholder;
    }
    return value instanceof Date ? value.toISOString() : String(value);
  });

  return { text, missingValues: [...missingValues].sort() };
}

export function createCatalogTranslator(options: CatalogTranslatorOptions): CatalogTranslator {
  const { defaultLocale, catalogs, onMissingMessage } = options;

  return {
    defaultLocale,
    catalogs,
    translate(messageId, values = {}, locale = defaultLocale) {
      const requestedLocale = canonicalizeLocale(locale);
      const resolvedLocale = resolveCatalogLocale(requestedLocale, catalogs, defaultLocale);
      const resolvedCatalog = catalogs[resolvedLocale];
      const fallbackCatalog = catalogs[defaultLocale];
      const hasResolvedMessage = hasOwnMessage(resolvedCatalog, messageId);
      const message = hasResolvedMessage
        ? resolvedCatalog?.[messageId]
        : fallbackCatalog?.[messageId];

      if (!message) {
        onMissingMessage?.(messageId, requestedLocale);
        return {
          messageId,
          requestedLocale,
          locale: resolvedLocale,
          text: messageId,
          translated: false,
          missingValues: [],
        };
      }

      if (!hasResolvedMessage) {
        onMissingMessage?.(messageId, requestedLocale);
      }

      const selectedTemplate = selectTemplate(message, values, resolvedLocale);
      const interpolated = interpolateTemplate(selectedTemplate, values);

      return {
        messageId,
        requestedLocale,
        locale: resolvedLocale,
        text: interpolated.text,
        translated: hasResolvedMessage,
        missingValues: interpolated.missingValues,
      };
    },
    completeness(locale) {
      const resolvedLocale = resolveCatalogLocale(locale, catalogs, defaultLocale);
      const sourceIds = Object.keys(catalogs[defaultLocale] ?? {}).sort();
      const localeIds = Object.keys(catalogs[resolvedLocale] ?? {}).sort();
      const localeIdSet = new Set(localeIds);
      const sourceIdSet = new Set(sourceIds);
      const missing = sourceIds.filter((id) => !localeIdSet.has(id));
      const obsolete = localeIds.filter((id) => !sourceIdSet.has(id));
      const translatedCount = sourceIds.length - missing.length;

      return {
        locale: resolvedLocale,
        missing,
        obsolete,
        completionRatio: sourceIds.length === 0 ? 1 : translatedCount / sourceIds.length,
      };
    },
  };
}

export function pseudolocalizeMessage(message: string): string {
  const expanded = message.replace(/[A-Za-z]/g, (letter) => PSEUDO_ACCENTS[letter] ?? letter);
  return `[!! ${expanded} !!]`;
}

export function pseudolocalizeCatalog(catalog: MessageCatalog): MessageCatalog {
  const pseudolocalized: Record<string, CatalogMessage> = {};

  for (const [id, message] of Object.entries(catalog)) {
    if (typeof message === 'string') {
      pseudolocalized[id] = pseudolocalizeMessage(message);
      continue;
    }

    pseudolocalized[id] = {
      ...message,
      zero: message.zero ? pseudolocalizeMessage(message.zero) : undefined,
      one: message.one ? pseudolocalizeMessage(message.one) : undefined,
      two: message.two ? pseudolocalizeMessage(message.two) : undefined,
      few: message.few ? pseudolocalizeMessage(message.few) : undefined,
      many: message.many ? pseudolocalizeMessage(message.many) : undefined,
      other: pseudolocalizeMessage(message.other),
    };
  }

  return pseudolocalized;
}
