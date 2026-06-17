// SPDX-License-Identifier: BUSL-1.1

import type { ColumnMapping } from '../../hooks/useDataImportWizard';

export interface MappingMemoryEntry {
  readonly key: string;
  readonly normalizedHeaders: readonly string[];
  readonly detectedSource: string;
  readonly fingerprint: string | null;
  readonly mapping: readonly ColumnMapping[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly useCount: number;
}

export interface MappingMemoryMatch {
  readonly entry: MappingMemoryEntry;
  readonly confidence: number;
  readonly missingHeaders: readonly string[];
  readonly addedHeaders: readonly string[];
  readonly source: 'remembered';
}

export interface MappingMemoryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CSV_MAPPING_MEMORY_STORAGE_KEY = 'finance.import.csvMappingMemory.v1';

export function getBrowserMappingMemoryStore(): MappingMemoryStore | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function rememberColumnMapping(input: {
  readonly store: MappingMemoryStore | null;
  readonly headers: readonly string[];
  readonly detectedSource: string;
  readonly mapping: readonly ColumnMapping[];
  readonly fingerprint?: string | null;
  readonly now?: Date;
}): MappingMemoryEntry | null {
  if (!input.store || input.headers.length === 0) return null;
  const normalizedHeaders = normalizeHeaders(input.headers);
  const key = buildMappingMemoryKey(normalizedHeaders, input.detectedSource, input.fingerprint ?? null);
  const existing = readMappingMemory(input.store).find((entry) => entry.key === key);
  const now = (input.now ?? new Date()).toISOString();
  const entry: MappingMemoryEntry = {
    key,
    normalizedHeaders,
    detectedSource: normalizeSource(input.detectedSource),
    fingerprint: normalizeFingerprint(input.fingerprint ?? null),
    mapping: cloneMapping(input.mapping),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    useCount: (existing?.useCount ?? 0) + 1,
  };
  const entries = readMappingMemory(input.store).filter((candidate) => candidate.key !== key);
  entries.push(entry);
  writeMappingMemory(input.store, entries);
  return entry;
}

export function findRememberedColumnMapping(input: {
  readonly store: MappingMemoryStore | null;
  readonly headers: readonly string[];
  readonly detectedSource: string;
  readonly fingerprint?: string | null;
}): MappingMemoryMatch | null {
  if (!input.store || input.headers.length === 0) return null;
  const normalizedHeaders = normalizeHeaders(input.headers);
  const desiredSource = normalizeSource(input.detectedSource);
  const desiredFingerprint = normalizeFingerprint(input.fingerprint ?? null);
  const candidates = readMappingMemory(input.store)
    .filter((entry) => entry.detectedSource === desiredSource)
    .filter((entry) => entry.fingerprint === desiredFingerprint || entry.fingerprint === null)
    .map((entry) => buildMatch(entry, normalizedHeaders))
    .filter((match) => match.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence || b.entry.updatedAt.localeCompare(a.entry.updatedAt));
  return candidates[0] ?? null;
}

export function forgetColumnMapping(input: {
  readonly store: MappingMemoryStore | null;
  readonly headers: readonly string[];
  readonly detectedSource: string;
  readonly fingerprint?: string | null;
}): boolean {
  if (!input.store) return false;
  const key = buildMappingMemoryKey(
    normalizeHeaders(input.headers),
    input.detectedSource,
    input.fingerprint ?? null,
  );
  const before = readMappingMemory(input.store);
  const after = before.filter((entry) => entry.key !== key);
  writeMappingMemory(input.store, after);
  return after.length !== before.length;
}

export function readMappingMemory(store: MappingMemoryStore): MappingMemoryEntry[] {
  const raw = store.getItem(CSV_MAPPING_MEMORY_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMappingMemoryEntry);
  } catch {
    return [];
  }
}

export function buildMappingMemoryKey(
  headersOrNormalizedHeaders: readonly string[],
  detectedSource: string,
  fingerprint: string | null,
): string {
  return [
    normalizeSource(detectedSource),
    normalizeFingerprint(fingerprint) ?? '',
    normalizeHeaders(headersOrNormalizedHeaders).join('|'),
  ].join('::');
}

export function normalizeHeaders(headers: readonly string[]): string[] {
  return headers.map(normalizeHeader);
}

function buildMatch(entry: MappingMemoryEntry, headers: readonly string[]): MappingMemoryMatch {
  const remembered = new Set(entry.normalizedHeaders);
  const current = new Set(headers);
  const missingHeaders = entry.normalizedHeaders.filter((header) => !current.has(header));
  const addedHeaders = headers.filter((header) => !remembered.has(header));
  const shared = entry.normalizedHeaders.filter((header) => current.has(header)).length;
  const denominator = Math.max(entry.normalizedHeaders.length, headers.length, 1);
  return {
    entry,
    confidence: shared / denominator,
    missingHeaders,
    addedHeaders,
    source: 'remembered',
  };
}

function writeMappingMemory(store: MappingMemoryStore, entries: readonly MappingMemoryEntry[]): void {
  store.setItem(CSV_MAPPING_MEMORY_STORAGE_KEY, JSON.stringify([...entries].slice(-25)));
}

function cloneMapping(mapping: readonly ColumnMapping[]): ColumnMapping[] {
  return mapping.map((item) => ({ ...item }));
}

function isMappingMemoryEntry(value: unknown): value is MappingMemoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<MappingMemoryEntry>;
  return (
    typeof candidate.key === 'string' &&
    Array.isArray(candidate.normalizedHeaders) &&
    typeof candidate.detectedSource === 'string' &&
    Array.isArray(candidate.mapping) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    typeof candidate.useCount === 'number'
  );
}

function normalizeSource(value: string): string {
  return normalizeHeader(value || 'generic');
}

function normalizeFingerprint(value: string | null): string | null {
  const normalized = normalizeHeader(value ?? '');
  return normalized.length > 0 ? normalized : null;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
