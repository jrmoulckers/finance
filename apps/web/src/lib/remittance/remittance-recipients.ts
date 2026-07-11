// SPDX-License-Identifier: BUSL-1.1

/**
 * Derive a reusable address book of remittance recipients from saved history
 * (issue #3322).
 *
 * A monthly remitter sends to the same one or two people every time, but the
 * form previously reset to fixed MX/MXN defaults and made them re-type the
 * recipient every time. Rather than introduce a new persisted entity, we derive
 * a de-duplicated, most-recent-first recipient list directly from the records
 * that `useRemittances` already stores — so the picker works immediately and
 * needs no schema change.
 */

import type { RemittanceRecord } from './remittance-types';

/** A previously-used recipient, prefilled from the most recent transfer to them. */
export interface SavedRemittanceRecipient {
  /** Stable key for the picker (`name|country`, lower-cased). */
  readonly key: string;
  /** Recipient display name (user-entered, never translated). */
  readonly name: string;
  /** Destination country (name or ISO code) as last entered. */
  readonly country: string;
  /** Source currency last used for this recipient (ISO 4217). */
  readonly sourceCurrency: string;
  /** Destination currency last used for this recipient (ISO 4217). */
  readonly destCurrency: string;
  /** Most recent send date to this recipient (`YYYY-MM-DD`). */
  readonly lastDate: string;
  /** Number of transfers sent to this recipient. */
  readonly count: number;
}

function recipientKey(name: string, country: string): string {
  return `${name.toLocaleLowerCase()}|${country.toLocaleLowerCase()}`;
}

/**
 * Build the recipient book from a remittance history.
 *
 * Records are grouped by trimmed name + country. Each group's currencies and
 * country reflect the *most recent* transfer to that recipient, so re-selecting
 * a recipient prefills the corridor they were last sent through. The list is
 * sorted most-recent-first (then by transfer count, then name) so the person a
 * user is most likely to send to again is first — and is used to seed the
 * form's defaults instead of a hardcoded MX/MXN.
 */
export function deriveSavedRecipients(
  records: readonly RemittanceRecord[],
): SavedRemittanceRecipient[] {
  const groups = new Map<string, SavedRemittanceRecipient>();

  for (const record of records) {
    const name = record.recipient.name.trim();
    const country = record.recipient.country.trim();
    if (!name) continue;

    const key = recipientKey(name, country);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        name,
        country,
        sourceCurrency: record.sourceCurrency,
        destCurrency: record.destCurrency,
        lastDate: record.date,
        count: 1,
      });
      continue;
    }

    const isNewer = record.date >= existing.lastDate;
    groups.set(key, {
      ...existing,
      count: existing.count + 1,
      lastDate: isNewer ? record.date : existing.lastDate,
      // Adopt the corridor from the most recent transfer to this recipient.
      country: isNewer ? country || existing.country : existing.country,
      sourceCurrency: isNewer ? record.sourceCurrency : existing.sourceCurrency,
      destCurrency: isNewer ? record.destCurrency : existing.destCurrency,
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.lastDate !== b.lastDate) return a.lastDate < b.lastDate ? 1 : -1;
    if (a.count !== b.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
}
