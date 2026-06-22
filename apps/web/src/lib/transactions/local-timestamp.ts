// SPDX-License-Identifier: BUSL-1.1

/**
 * Local timestamp + timezone preservation for transactions.
 *
 * A digital nomad who crosses time zones needs each transaction to keep the
 * *local* wall-clock time and time zone where the purchase happened. A midnight
 * airport purchase made at 12:05 AM in Bangkok should always belong to the
 * Bangkok calendar day, even when the user later reviews it from Lisbon.
 *
 * This module models a transaction's captured local timestamp as an ISO local
 * datetime (no zone designator) plus an IANA time zone and/or a fixed UTC
 * offset in minutes. It provides:
 *
 * - capture / normalize helpers (from an instant, from "now", or from a
 *   wall-clock form input),
 * - {@link getLocalCalendarDay} - the LOCAL calendar day for daily-spend
 *   grouping, independent of the viewer's time zone,
 * - {@link formatLocalTimestamp} - formats the original local time + zone,
 * - round-trip helpers to persist the value in the web transaction store's
 *   flexible `customFields` bag (no SQLDelight schema change required), mirroring
 *   how other web-only fields (e.g. BNPL liability metadata) are stored.
 *
 * All functions are pure and deterministic. No monetary values are touched -
 * money stays in integer cents elsewhere. When the captured field is absent the
 * helpers degrade gracefully to the existing date-only behavior and never throw.
 *
 * Offset convention: minutes east of UTC are positive (Asia/Bangkok = +420),
 * matching `../i18n/transaction-timestamp-context`.
 *
 * References: issue #2206
 */

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

/**
 * Reserved `customFields` keys used to persist the captured local timestamp
 * in the web transaction store. Kept stable so create -> persist -> detail and
 * grouping all agree on the same keys.
 */
export const LOCAL_TIMESTAMP_FIELD_KEYS = {
  /** ISO local datetime without zone designator, e.g. `2026-06-22T23:50`. */
  localDateTime: 'occurredLocalTime',
  /** IANA time zone identifier, e.g. `Asia/Bangkok`. */
  timeZone: 'occurredTimeZone',
  /** Fixed UTC offset in minutes (east positive), e.g. `420`. */
  offsetMinutes: 'occurredOffsetMinutes',
} as const;

/** A transaction's preserved local timestamp. */
export interface LocalTimestamp {
  /** ISO local wall-clock datetime without zone designator, e.g. `2026-06-22T23:50`. */
  readonly localDateTime: string;
  /** IANA time zone identifier (e.g. `Asia/Bangkok`), or `null` when unknown. */
  readonly timeZone: string | null;
  /** Fixed UTC offset in minutes, east-of-UTC positive, or `null` when unknown. */
  readonly offsetMinutes: number | null;
}

/** Minimal shape required to derive a transaction's local day. */
export interface LocalDayCarrier {
  /** Legacy calendar date (YYYY-MM-DD) used as a graceful fallback. */
  readonly date: string;
  /** Optional flexible field bag that may hold the captured local timestamp. */
  readonly customFields?: Readonly<Record<string, string>> | null;
}

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RESERVED_KEYS: ReadonlySet<string> = new Set(Object.values(LOCAL_TIMESTAMP_FIELD_KEYS));

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toValidDate(instant: Date | string | number): Date | null {
  const date = instant instanceof Date ? instant : new Date(instant);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Extract the wall-clock parts of an instant rendered in a given time zone. */
function zonedParts(instant: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
}

/** Parse a normalized `YYYY-MM-DDTHH:mm(:ss)?` string into UTC milliseconds. */
function wallClockToUtcMillis(localDateTime: string): number | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(localDateTime);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    second ? Number(second) : 0,
  );
}

/**
 * Compute the UTC offset (minutes, east positive) for an instant in a zone.
 * DST-aware because it is evaluated at the supplied instant.
 */
export function getZoneOffsetMinutes(instant: Date | string | number, timeZone: string): number {
  const date = toValidDate(instant);
  if (!date) return 0;
  const parts = zonedParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((zonedAsUtc - date.getTime()) / 60_000);
}

/**
 * Resolve the UTC offset (minutes, east positive) for a wall-clock datetime in
 * a zone, evaluated at the corresponding instant.
 */
function offsetForWallClock(localDateTime: string, timeZone: string): number | null {
  const asUtc = wallClockToUtcMillis(localDateTime);
  if (asUtc === null) return null;
  return getZoneOffsetMinutes(new Date(asUtc), timeZone);
}

/** Convert an IANA identifier into a friendly label, e.g. `Asia/Bangkok` -> `Bangkok`. */
function friendlyZoneName(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replace(/_/g, ' ');
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** The browser's current IANA time zone, falling back to `UTC`. */
export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// ---------------------------------------------------------------------------
// Capture / normalize
// ---------------------------------------------------------------------------

/**
 * Normalize a wall-clock datetime string to `YYYY-MM-DDTHH:mm`. Accepts values
 * with optional seconds and bare `YYYY-MM-DD` (treated as midnight). Returns
 * `null` when the input is not a recognizable local datetime.
 */
export function normalizeLocalDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = LOCAL_DATE_TIME_PATTERN.exec(trimmed);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return `${trimmed}T00:00`;
  }
  return null;
}

/**
 * Capture a {@link LocalTimestamp} from an absolute instant rendered in a zone.
 * Returns `null` for an invalid instant.
 */
export function captureFromInstant(
  instant: Date | string | number,
  timeZone: string = getBrowserTimeZone(),
): LocalTimestamp | null {
  const date = toValidDate(instant);
  if (!date) return null;
  const parts = zonedParts(date, timeZone);
  const localDateTime = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  return {
    localDateTime,
    timeZone,
    offsetMinutes: getZoneOffsetMinutes(date, timeZone),
  };
}

/** Capture the current moment as a {@link LocalTimestamp} in the given zone. */
export function captureNow(
  timeZone: string = getBrowserTimeZone(),
  now: Date = new Date(),
): LocalTimestamp {
  return (
    captureFromInstant(now, timeZone) ?? {
      localDateTime: '',
      timeZone,
      offsetMinutes: null,
    }
  );
}

/**
 * Build a {@link LocalTimestamp} from a wall-clock form input plus a zone. The
 * offset is derived from the zone at the corresponding instant (DST-aware).
 * When no zone is supplied the offset is left `null`. Returns `null` for an
 * unparsable datetime.
 */
export function createLocalTimestamp(
  localDateTime: string,
  timeZone: string | null = getBrowserTimeZone(),
): LocalTimestamp | null {
  const normalized = normalizeLocalDateTime(localDateTime);
  if (!normalized) return null;
  const zone = timeZone && timeZone.trim() ? timeZone.trim() : null;
  return {
    localDateTime: normalized,
    timeZone: zone,
    offsetMinutes: zone ? offsetForWallClock(normalized, zone) : null,
  };
}

// ---------------------------------------------------------------------------
// Local calendar day (grouping)
// ---------------------------------------------------------------------------

/**
 * Get the LOCAL calendar day (YYYY-MM-DD) for a captured timestamp, independent
 * of the viewer's time zone. The captured `localDateTime` is already expressed
 * in the merchant's wall clock, so the day is simply its date prefix.
 *
 * When the timestamp is missing or unusable the supplied `fallbackDate`
 * (typically the transaction's legacy date) is returned instead.
 */
export function getLocalCalendarDay(
  timestamp: LocalTimestamp | null | undefined,
  fallbackDate: string | null = null,
): string | null {
  if (timestamp && timestamp.localDateTime) {
    const match = LOCAL_DATE_TIME_PATTERN.exec(timestamp.localDateTime);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    if (DATE_ONLY_PATTERN.test(timestamp.localDateTime)) {
      return timestamp.localDateTime;
    }
  }
  return fallbackDate;
}

/**
 * Resolve the day a transaction should be grouped under for daily-spend views:
 * the captured LOCAL day when present, otherwise the legacy `date`. Always
 * returns a usable day string, degrading gracefully.
 */
export function getTransactionLocalDay(transaction: LocalDayCarrier): string {
  const timestamp = localTimestampFromCustomFields(transaction.customFields ?? null);
  return getLocalCalendarDay(timestamp, transaction.date) ?? transaction.date;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a UTC offset in minutes as `GMT+/-HH:MM`. */
export function formatTimeZoneOffset(offsetMinutes: number | null | undefined): string {
  if (offsetMinutes === null || offsetMinutes === undefined || Number.isNaN(offsetMinutes)) {
    return 'GMT';
  }
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `GMT${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** Build a human-readable zone label, e.g. `Bangkok - GMT+07:00`. */
export function formatTimeZoneLabel(timestamp: LocalTimestamp | null | undefined): string {
  if (!timestamp) return '';
  const segments: string[] = [];
  if (timestamp.timeZone) segments.push(friendlyZoneName(timestamp.timeZone));
  if (timestamp.offsetMinutes !== null && timestamp.offsetMinutes !== undefined) {
    segments.push(formatTimeZoneOffset(timestamp.offsetMinutes));
  }
  return segments.join(' \u00b7 ');
}

/** Options for {@link formatLocalTimestamp}. */
export interface FormatLocalTimestampOptions {
  /** Whether to append the zone label. Defaults to `true`. */
  readonly includeZone?: boolean;
}

/**
 * Format the preserved local time + zone for display, e.g.
 * `Jun 22, 2026, 11:50 PM (Bangkok - GMT+07:00)`.
 *
 * The wall-clock time is rendered exactly as captured - never re-projected into
 * the viewer's time zone. Returns an empty string when the timestamp is absent.
 */
export function formatLocalTimestamp(
  timestamp: LocalTimestamp | null | undefined,
  options: FormatLocalTimestampOptions = {},
): string {
  if (!timestamp || !timestamp.localDateTime) return '';
  const utcMillis = wallClockToUtcMillis(timestamp.localDateTime);
  if (utcMillis === null) return timestamp.localDateTime;

  const formatted = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    // The captured value is already a local wall clock; render it verbatim.
    timeZone: 'UTC',
  }).format(new Date(utcMillis));

  if (options.includeZone === false) return formatted;
  const zone = formatTimeZoneLabel(timestamp);
  return zone ? `${formatted} (${zone})` : formatted;
}

// ---------------------------------------------------------------------------
// customFields round-trip
// ---------------------------------------------------------------------------

/** Whether a `customFields` key is reserved for the local timestamp. */
export function isLocalTimestampFieldKey(key: string): boolean {
  return RESERVED_KEYS.has(key);
}

/** Serialize a {@link LocalTimestamp} into `customFields` entries. */
export function localTimestampToCustomFields(
  timestamp: LocalTimestamp | null | undefined,
): Record<string, string> {
  if (!timestamp || !timestamp.localDateTime) return {};
  const fields: Record<string, string> = {
    [LOCAL_TIMESTAMP_FIELD_KEYS.localDateTime]: timestamp.localDateTime,
  };
  if (timestamp.timeZone) {
    fields[LOCAL_TIMESTAMP_FIELD_KEYS.timeZone] = timestamp.timeZone;
  }
  if (timestamp.offsetMinutes !== null && timestamp.offsetMinutes !== undefined) {
    fields[LOCAL_TIMESTAMP_FIELD_KEYS.offsetMinutes] = String(timestamp.offsetMinutes);
  }
  return fields;
}

/**
 * Read a {@link LocalTimestamp} back from a transaction's `customFields`.
 * Returns `null` when no captured timestamp is present (graceful fallback). A
 * missing offset is re-derived from the zone when possible.
 */
export function localTimestampFromCustomFields(
  customFields: Readonly<Record<string, string>> | null | undefined,
): LocalTimestamp | null {
  if (!customFields) return null;
  const rawLocal = customFields[LOCAL_TIMESTAMP_FIELD_KEYS.localDateTime];
  const normalized = normalizeLocalDateTime(rawLocal);
  if (!normalized) return null;

  const timeZone = customFields[LOCAL_TIMESTAMP_FIELD_KEYS.timeZone] || null;

  let offsetMinutes: number | null = null;
  const rawOffset = customFields[LOCAL_TIMESTAMP_FIELD_KEYS.offsetMinutes];
  if (rawOffset !== undefined && rawOffset !== '') {
    const parsed = Number.parseInt(rawOffset, 10);
    if (Number.isFinite(parsed)) offsetMinutes = parsed;
  }
  if (offsetMinutes === null && timeZone) {
    offsetMinutes = offsetForWallClock(normalized, timeZone);
  }

  return { localDateTime: normalized, timeZone, offsetMinutes };
}

/**
 * Merge a captured local timestamp into an existing `customFields` map,
 * replacing any prior reserved keys. Passing `null` strips the captured value.
 * The input map is not mutated.
 */
export function applyLocalTimestampToCustomFields(
  customFields: Readonly<Record<string, string>> | null | undefined,
  timestamp: LocalTimestamp | null | undefined,
): Record<string, string> {
  const next: Record<string, string> = {};
  if (customFields) {
    for (const [key, value] of Object.entries(customFields)) {
      if (!isLocalTimestampFieldKey(key)) next[key] = value;
    }
  }
  Object.assign(next, localTimestampToCustomFields(timestamp));
  return next;
}
