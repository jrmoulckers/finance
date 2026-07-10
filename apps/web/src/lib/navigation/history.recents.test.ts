// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import { getAllVisitCounts, getRecentRoutes, recordNavigationEntry } from './history';

function record(path: string, key: string): void {
  recordNavigationEntry({ path, title: path, key, visitedAt: Date.now() });
}

describe('navigation history recents (#3676 / #3687)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('aggregates visit counts across navigations', () => {
    record('/a', 'a1');
    record('/b', 'b1');
    record('/a', 'a2');

    expect(getAllVisitCounts()).toEqual({ '/a': 2, '/b': 1 });
  });

  it('returns recent routes newest-first, de-duplicated by path', () => {
    record('/a', 'a1');
    record('/b', 'b1');
    record('/c', 'c1');
    record('/a', 'a2');

    expect(getRecentRoutes(5).map((entry) => entry.path)).toEqual(['/a', '/c', '/b']);
  });

  it('excludes the current path from recents', () => {
    record('/a', 'a1');
    record('/b', 'b1');
    record('/c', 'c1');

    expect(getRecentRoutes(5, '/c').map((entry) => entry.path)).toEqual(['/b', '/a']);
  });

  it('caps the number of recents at the requested limit', () => {
    record('/a', 'a1');
    record('/b', 'b1');
    record('/c', 'c1');

    expect(getRecentRoutes(2).map((entry) => entry.path)).toEqual(['/c', '/b']);
  });

  it('returns an empty list when no navigation has been recorded', () => {
    expect(getRecentRoutes(5)).toEqual([]);
    expect(getAllVisitCounts()).toEqual({});
  });
});
