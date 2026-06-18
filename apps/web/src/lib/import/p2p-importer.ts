// SPDX-License-Identifier: BUSL-1.1

import { parseCsv } from '../csv-parser';
import { parseCurrencyToCents, parseDate } from './csv-parser';

export type P2PProvider = 'venmo' | 'cash-app';
export type P2PTransactionKind = 'payment' | 'request' | 'fee' | 'instant_transfer' | 'refund';
export type P2PDirection = 'inflow' | 'outflow' | 'neutral';

export interface P2PTransaction {
  readonly provider: P2PProvider;
  readonly kind: P2PTransactionKind;
  readonly date: string;
  readonly amountCents: number;
  readonly feeCents: number;
  readonly direction: P2PDirection;
  readonly counterpartyHash: string | null;
  readonly memoPreview: string | null;
  readonly providerId: string | null;
  readonly rawFields: Readonly<Record<string, string>>;
}

export interface P2PImportResult {
  readonly provider: P2PProvider;
  readonly transactions: readonly P2PTransaction[];
  readonly errors: readonly string[];
}

export function detectP2PProvider(headers: readonly string[]): P2PProvider | null {
  const normalized = headers.map(normalizeHeader);
  if (normalized.includes('datetime') && normalized.includes('note') && normalized.includes('from'))
    return 'venmo';
  if (
    normalized.includes('transaction type') &&
    normalized.includes('name') &&
    normalized.includes('notes')
  ) {
    return 'cash-app';
  }
  return null;
}

export function parseP2PCsv(content: string, provider?: P2PProvider): P2PImportResult {
  const { headers, rows } = parseCsv(content);
  const detected = provider ?? detectP2PProvider(headers);
  if (!detected)
    return { provider: 'venmo', transactions: [], errors: ['Unsupported P2P CSV headers'] };

  const transactions: P2PTransaction[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const rawFields = toRawFields(headers, row);
    const parsed = detected === 'venmo' ? parseVenmoRow(rawFields) : parseCashAppRow(rawFields);
    if ('error' in parsed) {
      errors.push(`Row ${index + 1}: ${parsed.error}`);
      return;
    }
    transactions.push(parsed.transaction);
  });

  return { provider: detected, transactions, errors };
}

function parseVenmoRow(
  rawFields: Readonly<Record<string, string>>,
): { transaction: P2PTransaction; error?: never } | { transaction?: never; error: string } {
  const date = parseDate(read(rawFields, ['datetime', 'date']));
  const amountCents = parseCurrencyToCents(read(rawFields, ['amount', 'total']));
  if (!date) return { error: 'missing or invalid date' };
  if (amountCents === null) return { error: 'missing or invalid amount' };
  const type = read(rawFields, ['type']);
  const note = read(rawFields, ['note', 'memo']);
  const counterparty = amountCents < 0 ? read(rawFields, ['to']) : read(rawFields, ['from']);
  return {
    transaction: makeTransaction({
      provider: 'venmo',
      date,
      amountCents,
      feeCents: parseCurrencyToCents(read(rawFields, ['fee'])) ?? 0,
      type,
      note,
      counterparty,
      providerId: read(rawFields, ['id', 'transaction id']),
      rawFields,
    }),
  };
}

function parseCashAppRow(
  rawFields: Readonly<Record<string, string>>,
): { transaction: P2PTransaction; error?: never } | { transaction?: never; error: string } {
  const date = parseDate(read(rawFields, ['date', 'transaction date']));
  const amountCents = parseCurrencyToCents(read(rawFields, ['amount', 'net amount']));
  if (!date) return { error: 'missing or invalid date' };
  if (amountCents === null) return { error: 'missing or invalid amount' };
  return {
    transaction: makeTransaction({
      provider: 'cash-app',
      date,
      amountCents,
      feeCents: parseCurrencyToCents(read(rawFields, ['fee', 'fees'])) ?? 0,
      type: read(rawFields, ['transaction type', 'type']),
      note: read(rawFields, ['notes', 'note']),
      counterparty: read(rawFields, ['name', 'counterparty']),
      providerId: read(rawFields, ['id', 'transaction id']),
      rawFields,
    }),
  };
}

function makeTransaction(input: {
  readonly provider: P2PProvider;
  readonly date: string;
  readonly amountCents: number;
  readonly feeCents: number;
  readonly type: string;
  readonly note: string;
  readonly counterparty: string;
  readonly providerId: string;
  readonly rawFields: Readonly<Record<string, string>>;
}): P2PTransaction {
  return {
    provider: input.provider,
    kind: toP2PKind(input.type, input.note, input.amountCents, input.feeCents),
    date: input.date,
    amountCents: input.amountCents,
    feeCents: Math.abs(input.feeCents),
    direction: input.amountCents > 0 ? 'inflow' : input.amountCents < 0 ? 'outflow' : 'neutral',
    counterpartyHash: input.counterparty ? stableHash(input.counterparty) : null,
    memoPreview: sanitizeMemo(input.note),
    providerId: emptyToNull(input.providerId),
    rawFields: sanitizeRawFields(input.rawFields),
  };
}

function toP2PKind(
  type: string,
  note: string,
  amountCents: number,
  feeCents: number,
): P2PTransactionKind {
  const normalized = normalizeHeader(`${type} ${note}`);
  if (/\b(refund|reversal)\b/.test(normalized)) return 'refund';
  if (/\b(instant transfer|cash out|transfer to bank)\b/.test(normalized))
    return 'instant_transfer';
  if (/\b(request|charge)\b/.test(normalized)) return 'request';
  if (feeCents !== 0 && amountCents === 0) return 'fee';
  if (/\bfee\b/.test(normalized)) return 'fee';
  return 'payment';
}

function sanitizeRawFields(
  fields: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    sanitized[key] =
      /^(from|to|name|counterparty)$/i.test(key.trim()) && value.trim()
        ? `[hash:${stableHash(value)}]`
        : value;
  }
  return sanitized;
}

function sanitizeMemo(value: string): string | null {
  const trimmed = value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed) return null;
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  const normalized = value.toLowerCase().trim();
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toRawFields(headers: readonly string[], row: readonly string[]): Record<string, string> {
  const rawFields: Record<string, string> = {};
  headers.forEach((header, index) => {
    rawFields[header] = row[index] ?? '';
  });
  return rawFields;
}

function read(fields: Readonly<Record<string, string>>, names: readonly string[]): string {
  for (const name of names) {
    const entry = Object.entries(fields).find(
      ([key]) => normalizeHeader(key) === normalizeHeader(name),
    );
    if (entry && entry[1].trim()) return entry[1].trim();
  }
  return '';
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
