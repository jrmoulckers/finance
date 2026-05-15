// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { StorageError, getUserFriendlyStorageMessage, type StorageErrorCode } from '../sqlite-wasm';

describe('StorageError', () => {
  it('creates an error with a code, message, and backend', () => {
    const error = new StorageError('WASM_LOAD_FAILED', 'WASM failed', {
      backend: 'opfs',
      fallbackAttempted: false,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.name).toBe('StorageError');
    expect(error.code).toBe('WASM_LOAD_FAILED');
    expect(error.message).toBe('WASM failed');
    expect(error.backend).toBe('opfs');
    expect(error.fallbackAttempted).toBe(false);
  });

  it('preserves the cause chain', () => {
    const rootCause = new TypeError('WebAssembly.instantiate failed');
    const error = new StorageError('WASM_LOAD_FAILED', 'Failed to load', {
      cause: rootCause,
      backend: 'opfs',
    });

    expect(error.cause).toBe(rootCause);
  });

  it('defaults backend to null and fallbackAttempted to false', () => {
    const error = new StorageError('UNKNOWN', 'Something broke');

    expect(error.backend).toBeNull();
    expect(error.fallbackAttempted).toBe(false);
  });

  it('tracks when a fallback was attempted', () => {
    const error = new StorageError('INDEXEDDB_FAILED', 'IndexedDB failed', {
      backend: 'indexeddb',
      fallbackAttempted: true,
    });

    expect(error.fallbackAttempted).toBe(true);
    expect(error.backend).toBe('indexeddb');
  });
});

describe('getUserFriendlyStorageMessage', () => {
  const codes: StorageErrorCode[] = [
    'WASM_LOAD_FAILED',
    'OPFS_UNAVAILABLE',
    'OPFS_INIT_FAILED',
    'INDEXEDDB_FAILED',
    'QUOTA_EXCEEDED',
    'MIGRATION_FAILED',
    'UNKNOWN',
  ];

  it.each(codes)('returns a non-empty string for code "%s"', (code) => {
    const message = getUserFriendlyStorageMessage(code);
    expect(message).toBeTruthy();
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(10);
  });

  it('returns a message that does not expose technical jargon for WASM_LOAD_FAILED', () => {
    const message = getUserFriendlyStorageMessage('WASM_LOAD_FAILED');
    expect(message).toContain('database engine');
    expect(message).not.toContain('WebAssembly');
    expect(message).not.toContain('WASM');
  });

  it('mentions storage for QUOTA_EXCEEDED', () => {
    const message = getUserFriendlyStorageMessage('QUOTA_EXCEEDED');
    expect(message.toLowerCase()).toContain('storage');
    expect(message.toLowerCase()).toContain('full');
  });

  it('provides actionable guidance for INDEXEDDB_FAILED', () => {
    const message = getUserFriendlyStorageMessage('INDEXEDDB_FAILED');
    expect(message.toLowerCase()).toContain('browser');
  });
});
