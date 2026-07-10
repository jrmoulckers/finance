// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { getDetailRoute, getDetailRouteParent, isDetailRoute } from './detail-routes';

describe('detail-routes', () => {
  it('recognises list/:id detail routes and their parents', () => {
    expect(isDetailRoute('/accounts/abc')).toBe(true);
    expect(getDetailRouteParent('/accounts/abc')).toBe('/accounts');
    expect(getDetailRouteParent('/transactions/42')).toBe('/transactions');
    expect(getDetailRouteParent('/budgets/x')).toBe('/budgets');
    expect(getDetailRouteParent('/goals/x')).toBe('/goals');
    expect(getDetailRouteParent('/investments/x')).toBe('/investments');
    expect(getDetailRouteParent('/bills/x')).toBe('/bills');
  });

  it('exposes a singular record label for breadcrumbs', () => {
    expect(getDetailRoute('/accounts/abc')?.detailLabel).toBe('Account');
    expect(getDetailRoute('/transactions/1')?.detailLabel).toBe('Transaction');
  });

  it('does not treat top-level list routes as detail routes', () => {
    expect(isDetailRoute('/accounts')).toBe(false);
    expect(getDetailRouteParent('/accounts')).toBeNull();
    expect(isDetailRoute('/dashboard')).toBe(false);
  });

  it('does not treat deeper or unknown routes as detail routes', () => {
    expect(isDetailRoute('/transactions/42/edit')).toBe(false);
    expect(isDetailRoute('/settings/preferences')).toBe(false);
  });

  it('excludes known static children that share a detail parent', () => {
    expect(isDetailRoute('/investments/tax')).toBe(false);
    expect(getDetailRouteParent('/investments/tax')).toBeNull();
    expect(isDetailRoute('/bills/new')).toBe(false);
    expect(getDetailRouteParent('/bills/new')).toBeNull();
    // ...but a real id under the same parent is still a detail route.
    expect(isDetailRoute('/investments/abc123')).toBe(true);
    expect(isDetailRoute('/bills/abc123')).toBe(true);
  });
});
