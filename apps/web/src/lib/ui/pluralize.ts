/**
 * Lightweight English pluralization helpers for short, non-localized UI count
 * labels (e.g. "1 day left", "3 bills"). For fully localized, catalog-driven
 * copy use the i18n message catalog (`lib/i18n`) with `Intl.PluralRules`
 * instead; these helpers exist for the many internal count strings that are
 * currently hardcoded in English.
 */

/**
 * Return the singular or plural form of a noun for a given count.
 *
 * Uses the common English rule where the plural is the singular plus "s".
 * Pass an explicit `plural` for irregular nouns. A count of exactly one
 * (in either direction) is treated as singular.
 *
 * @param count - The quantity the noun describes.
 * @param singular - The singular form of the noun (e.g. "day").
 * @param plural - Optional explicit plural form (defaults to `singular + "s"`).
 * @returns The singular form when `|count|` is 1, otherwise the plural form.
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string = `${singular}s`,
): string {
  return Math.abs(count) === 1 ? singular : plural;
}

/**
 * Format a count together with its correctly pluralized noun.
 *
 * @param count - The quantity to display.
 * @param singular - The singular form of the noun (e.g. "day").
 * @param plural - Optional explicit plural form (defaults to `singular + "s"`).
 * @returns A string such as "1 day" or "3 days".
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
