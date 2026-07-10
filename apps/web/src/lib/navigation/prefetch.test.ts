// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it, vi } from 'vitest';

import { canPrefetch, hasPrefetched, prefetchRoute, resetPrefetchCacheForTests } from './prefetch';

afterEach(() => {
  resetPrefetchCacheForTests();
  vi.unstubAllGlobals();
});

describe('prefetch registry (#3672)', () => {
  it('knows which routes have a registered chunk loader', () => {
    expect(canPrefetch('/accounts')).toBe(true);
    expect(canPrefetch('/investments/tax')).toBe(true);
    expect(canPrefetch('/not-a-real-route')).toBe(false);
  });

  it('does nothing for an unregistered route', () => {
    expect(prefetchRoute('/not-a-real-route')).toBe(false);
    expect(hasPrefetched('/not-a-real-route')).toBe(false);
  });

  it('warms a route once and dedupes subsequent calls', () => {
    // The first call registers the href synchronously, then kicks off the
    // dynamic import; the second call is a no-op.
    expect(prefetchRoute('/net-worth')).toBe(true);
    expect(hasPrefetched('/net-worth')).toBe(true);
    expect(prefetchRoute('/net-worth')).toBe(false);
  });

  it('respects Data Saver and never prefetches', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    expect(prefetchRoute('/goals')).toBe(false);
    expect(hasPrefetched('/goals')).toBe(false);
  });

  it('skips prefetch on 2g-class connections', () => {
    vi.stubGlobal('navigator', { connection: { effectiveType: 'slow-2g' } });
    expect(prefetchRoute('/goals')).toBe(false);
    expect(hasPrefetched('/goals')).toBe(false);
  });
});
