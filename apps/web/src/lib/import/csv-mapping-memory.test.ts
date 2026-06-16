// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  CSV_MAPPING_MEMORY_STORAGE_KEY,
  findRememberedColumnMapping,
  forgetColumnMapping,
  readMappingMemory,
  rememberColumnMapping,
  type MappingMemoryStore,
} from './csv-mapping-memory';

function memoryStore(): MappingMemoryStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

const headers = ['Posted Date', 'Merchant', 'Debit', 'Memo'];
const mapping = [
  { columnIndex: 0, columnName: 'Posted Date', mappedField: 'date' as const },
  { columnIndex: 1, columnName: 'Merchant', mappedField: 'payee' as const },
  { columnIndex: 2, columnName: 'Debit', mappedField: 'amount' as const },
  { columnIndex: 3, columnName: 'Memo', mappedField: 'note' as const },
];

describe('csv mapping memory', () => {
  it('persists user-approved mappings for a first import', () => {
    const store = memoryStore();
    const saved = rememberColumnMapping({ store, headers, detectedSource: 'generic', mapping });

    expect(saved?.useCount).toBe(1);
    expect(readMappingMemory(store)).toHaveLength(1);
    expect(store.getItem(CSV_MAPPING_MEMORY_STORAGE_KEY)).toContain('posted date');
  });

  it('auto-applies remembered mappings for a repeated import', () => {
    const store = memoryStore();
    rememberColumnMapping({ store, headers, detectedSource: 'generic', mapping });

    const match = findRememberedColumnMapping({ store, headers, detectedSource: 'generic' });

    expect(match?.confidence).toBe(1);
    expect(match?.entry.mapping).toEqual(mapping);
    expect(match?.source).toBe('remembered');
  });

  it('reports changed and missing columns when headers drift', () => {
    const store = memoryStore();
    rememberColumnMapping({ store, headers, detectedSource: 'generic', mapping });

    const match = findRememberedColumnMapping({
      store,
      headers: ['Posted Date', 'Merchant', 'Debit', 'Reference'],
      detectedSource: 'generic',
    });

    expect(match?.confidence).toBe(0.75);
    expect(match?.missingHeaders).toEqual(['memo']);
    expect(match?.addedHeaders).toEqual(['reference']);
  });

  it('forgets saved mappings locally', () => {
    const store = memoryStore();
    rememberColumnMapping({ store, headers, detectedSource: 'generic', mapping });

    expect(forgetColumnMapping({ store, headers, detectedSource: 'generic' })).toBe(true);
    expect(findRememberedColumnMapping({ store, headers, detectedSource: 'generic' })).toBeNull();
  });
});
