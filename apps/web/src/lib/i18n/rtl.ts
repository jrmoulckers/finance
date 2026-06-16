// SPDX-License-Identifier: BUSL-1.1

export type TextDirection = 'ltr' | 'rtl';

const RTL_LANGUAGES = new Set(['ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'ur', 'yi']);
const FIRST_STRONG_ISOLATE = '\u2068';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

export function getLocaleLanguage(locale: string): string {
  try {
    return new Intl.Locale(locale).language.toLowerCase();
  } catch {
    return locale.split('-')[0]?.toLowerCase() ?? locale.toLowerCase();
  }
}

export function getTextDirectionForLocale(locale: string): TextDirection {
  return RTL_LANGUAGES.has(getLocaleLanguage(locale)) ? 'rtl' : 'ltr';
}

export function applyDocumentDirection(
  locale: string,
  targetDocument: Pick<Document, 'documentElement'> | undefined = globalThis.document,
): TextDirection {
  const direction = getTextDirectionForLocale(locale);
  if (targetDocument?.documentElement) {
    targetDocument.documentElement.lang = locale;
    targetDocument.documentElement.dir = direction;
  }
  return direction;
}

export function bidiIsolate(value: string | number): string {
  const text = String(value);
  if (text.startsWith(FIRST_STRONG_ISOLATE) && text.endsWith(POP_DIRECTIONAL_ISOLATE)) {
    return text;
  }
  return `${FIRST_STRONG_ISOLATE}${text}${POP_DIRECTIONAL_ISOLATE}`;
}

export function joinBidiIsolated(parts: ReadonlyArray<string | number>, separator = ' '): string {
  return parts.map((part) => bidiIsolate(part)).join(separator);
}
