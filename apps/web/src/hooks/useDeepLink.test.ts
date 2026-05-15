// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDeepLink, matchRoute } from './useDeepLink';

// ---------------------------------------------------------------------------
// matchRoute (pure function)
// ---------------------------------------------------------------------------

describe('matchRoute', () => {
  it('matches a static route', () => {
    expect(matchRoute('/accounts', '/accounts')).toEqual({});
  });

  it('extracts a single parameter', () => {
    expect(matchRoute('/accounts/:id', '/accounts/abc-123')).toEqual({
      id: 'abc-123',
    });
  });

  it('extracts multiple parameters', () => {
    expect(
      matchRoute('/accounts/:accountId/transactions/:txId', '/accounts/a1/transactions/t2'),
    ).toEqual({ accountId: 'a1', txId: 't2' });
  });

  it('returns null for non-matching paths', () => {
    expect(matchRoute('/accounts/:id', '/transactions/abc')).toBeNull();
  });

  it('returns null for mismatched segment counts', () => {
    expect(matchRoute('/accounts/:id', '/accounts')).toBeNull();
    expect(matchRoute('/accounts', '/accounts/extra')).toBeNull();
  });

  it('decodes URI-encoded path segments', () => {
    expect(matchRoute('/search/:query', '/search/hello%20world')).toEqual({
      query: 'hello world',
    });
  });

  it('matches root path', () => {
    expect(matchRoute('/', '/')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// useDeepLink hook
// ---------------------------------------------------------------------------

describe('useDeepLink', () => {
  it('matches a single pattern', () => {
    const { result } = renderHook(() => useDeepLink('/accounts/:id', '/accounts/abc'));

    expect(result.current.isMatch).toBe(true);
    expect(result.current.matchedRoute).toBe('/accounts/:id');
    expect(result.current.params).toEqual({ id: 'abc' });
  });

  it('matches the first matching pattern from an array', () => {
    const { result } = renderHook(() =>
      useDeepLink(['/accounts/:id', '/transactions/:id'], '/transactions/tx-1'),
    );

    expect(result.current.isMatch).toBe(true);
    expect(result.current.matchedRoute).toBe('/transactions/:id');
    expect(result.current.params).toEqual({ id: 'tx-1' });
  });

  it('returns no match for unrecognized paths', () => {
    const { result } = renderHook(() => useDeepLink(['/accounts/:id'], '/settings'));

    expect(result.current.isMatch).toBe(false);
    expect(result.current.matchedRoute).toBeNull();
    expect(result.current.params).toEqual({});
  });

  it('handles empty pattern list', () => {
    const { result } = renderHook(() => useDeepLink([], '/accounts/abc'));

    expect(result.current.isMatch).toBe(false);
  });
});
