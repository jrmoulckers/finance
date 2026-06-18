// SPDX-License-Identifier: BUSL-1.1

export interface TransactionTimestampContextInput {
  readonly occurredAt: string | Date | null | undefined;
  readonly occurredTimeZone?: string | null;
  readonly legacyDate?: string | null;
}

export interface TransactionTimestampContext {
  readonly occurredAt: string | null;
  readonly occurredTimeZone: string | null;
  readonly occurredOffsetMinutes: number | null;
  readonly merchantLocalDate: string | null;
  readonly isDateOnlyLegacy: boolean;
}

function formatParts(date: Date, timeZone: string): Record<string, string> {
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

  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function getMerchantLocalDate(occurredAt: string | Date, timeZone: string): string {
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const parts = formatParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTimeZoneOffsetMinutes(occurredAt: string | Date, timeZone: string): number {
  const date = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const parts = formatParts(date, timeZone);
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

export function createTransactionTimestampContext(
  input: TransactionTimestampContextInput,
): TransactionTimestampContext {
  const timeZone =
    input.occurredTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  if (!input.occurredAt) {
    return {
      occurredAt: null,
      occurredTimeZone: null,
      occurredOffsetMinutes: null,
      merchantLocalDate: input.legacyDate ?? null,
      isDateOnlyLegacy: true,
    };
  }

  const date = input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt);
  if (Number.isNaN(date.getTime())) {
    return {
      occurredAt: null,
      occurredTimeZone: null,
      occurredOffsetMinutes: null,
      merchantLocalDate: input.legacyDate ?? null,
      isDateOnlyLegacy: true,
    };
  }

  return {
    occurredAt: date.toISOString(),
    occurredTimeZone: timeZone,
    occurredOffsetMinutes: getTimeZoneOffsetMinutes(date, timeZone),
    merchantLocalDate: getMerchantLocalDate(date, timeZone),
    isDateOnlyLegacy: false,
  };
}
