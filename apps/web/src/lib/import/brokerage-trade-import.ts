// SPDX-License-Identifier: BUSL-1.1

import { parseCsv } from '../csv-parser';
import { parseCurrencyToCents, parseDate } from './csv-parser';

export type BrokerageActivityKind =
  'fill' | 'fee' | 'dividend' | 'transfer' | 'option_event' | 'corporate_action' | 'crypto_trade';

export interface BrokerageProviderMetadata {
  readonly provider: string;
  readonly accountId: string | null;
  readonly sourceFileName: string | null;
}

export interface BrokerageTradeActivity {
  readonly kind: BrokerageActivityKind;
  readonly date: string;
  readonly symbol: string | null;
  readonly description: string;
  readonly quantity: number | null;
  readonly priceCents: number | null;
  readonly amountCents: number;
  readonly feeCents: number;
  readonly providerId: string | null;
  readonly optionLegId: string | null;
  readonly metadata: BrokerageProviderMetadata;
  readonly rawFields: Readonly<Record<string, string>>;
}

export interface BrokerageImportResult {
  readonly activities: readonly BrokerageTradeActivity[];
  readonly duplicateProviderIds: readonly string[];
  readonly errors: readonly string[];
}

export interface BrokerageImportAdapter {
  readonly id: string;
  detect(headers: readonly string[]): boolean;
  parse(content: string, metadata: BrokerageProviderMetadata): BrokerageImportResult;
}

export const manualBrokerageCsvAdapter: BrokerageImportAdapter = {
  id: 'manual-brokerage-csv',
  detect(headers) {
    const normalized = headers.map(normalizeHeader);
    return (
      hasAny(normalized, ['symbol', 'ticker']) && hasAny(normalized, ['activity', 'action', 'type'])
    );
  },
  parse(content, metadata) {
    const { headers, rows } = parseCsv(content);
    const activities: BrokerageTradeActivity[] = [];
    const errors: string[] = [];

    rows.forEach((row, index) => {
      const rawFields = toRawFields(headers, row);
      const date = parseDate(read(rawFields, ['date', 'trade date', 'transaction date']));
      const action = read(rawFields, ['action', 'activity', 'type']);
      const amountCents =
        parseCurrencyToCents(read(rawFields, ['amount', 'net amount', 'total'])) ?? 0;
      if (!date) {
        errors.push(`Row ${index + 1}: missing or invalid trade date`);
        return;
      }
      if (!action) {
        errors.push(`Row ${index + 1}: missing activity type`);
        return;
      }

      activities.push({
        kind: toActivityKind(action, read(rawFields, ['symbol', 'ticker'])),
        date,
        symbol: emptyToNull(read(rawFields, ['symbol', 'ticker'])),
        description: read(rawFields, ['description', 'memo', 'action', 'activity']) || action,
        quantity: parseOptionalNumber(read(rawFields, ['quantity', 'qty', 'shares'])),
        priceCents: parseCurrencyToCents(read(rawFields, ['price', 'share price'])) ?? null,
        amountCents,
        feeCents: parseCurrencyToCents(read(rawFields, ['fee', 'fees', 'commission'])) ?? 0,
        providerId: emptyToNull(read(rawFields, ['id', 'transaction id', 'provider id'])),
        optionLegId: emptyToNull(read(rawFields, ['leg id', 'option leg', 'strategy id'])),
        metadata,
        rawFields,
      });
    });

    return { activities, duplicateProviderIds: findDuplicateProviderIds(activities), errors };
  },
};

export function parseManualBrokerageCsv(
  content: string,
  metadata: BrokerageProviderMetadata,
): BrokerageImportResult {
  return manualBrokerageCsvAdapter.parse(content, metadata);
}

function toActivityKind(action: string, symbol: string): BrokerageActivityKind {
  const normalized = normalizeHeader(`${action} ${symbol}`);
  if (/option|call|put|assigned|expired|exercise/.test(normalized)) return 'option_event';
  if (/crypto|btc|eth|doge|sol/.test(normalized)) return 'crypto_trade';
  if (/dividend|distribution/.test(normalized)) return 'dividend';
  if (/transfer|deposit|withdrawal|journal/.test(normalized)) return 'transfer';
  if (/fee|commission|interest charge/.test(normalized)) return 'fee';
  if (/split|merger|spinoff|reorg/.test(normalized)) return 'corporate_action';
  return 'fill';
}

function findDuplicateProviderIds(activities: readonly BrokerageTradeActivity[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const activity of activities) {
    const id = activity.providerId;
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
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

function hasAny(headers: readonly string[], names: readonly string[]): boolean {
  return names.some((name) => headers.includes(normalizeHeader(name)));
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOptionalNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
