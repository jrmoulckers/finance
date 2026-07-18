// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the secure-context-safe UUID helper.
 *
 * References: issue #3898
 */

import { describe, it, expect, afterEach } from 'vitest';
import { safeRandomUUID } from './uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('safeRandomUUID', () => {
  const originalRandomUUID = crypto.randomUUID;
  const originalGetRandomValues = crypto.getRandomValues;

  afterEach(() => {
    (crypto as { randomUUID?: unknown }).randomUUID = originalRandomUUID;
    (crypto as { getRandomValues?: unknown }).getRandomValues = originalGetRandomValues;
  });

  it('uses the native crypto.randomUUID when available', () => {
    expect(safeRandomUUID()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    (crypto as { randomUUID?: unknown }).randomUUID = undefined;

    const id = safeRandomUUID();
    expect(id).toMatch(UUID_V4);
  });

  it('falls back to Math.random when no crypto APIs are available', () => {
    (crypto as { randomUUID?: unknown }).randomUUID = undefined;
    (crypto as { getRandomValues?: unknown }).getRandomValues = undefined;

    const id = safeRandomUUID();
    expect(id).toMatch(UUID_V4);
  });

  it('produces unique values across calls', () => {
    (crypto as { randomUUID?: unknown }).randomUUID = undefined;

    const ids = new Set(Array.from({ length: 100 }, () => safeRandomUUID()));
    expect(ids.size).toBe(100);
  });
});
