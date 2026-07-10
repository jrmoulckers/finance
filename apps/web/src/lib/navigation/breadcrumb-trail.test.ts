// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { buildBreadcrumbTrail } from './breadcrumb-trail';

describe('buildBreadcrumbTrail (#3667)', () => {
  it('returns a single crumb for a top-level route (callers render no trail)', () => {
    const trail = buildBreadcrumbTrail('/accounts');
    expect(trail.map((c) => c.label)).toEqual(['Accounts']);
    expect(trail[0]?.href).toBeUndefined();
  });

  it('builds a hierarchy for a nested settings route', () => {
    const trail = buildBreadcrumbTrail('/settings/preferences');
    expect(trail).toEqual([{ label: 'Settings', href: '/settings' }, { label: 'Preferences' }]);
  });

  it('links known ancestors and names the final page for known nested routes', () => {
    const trail = buildBreadcrumbTrail('/investments/tax');
    expect(trail).toEqual([
      { label: 'Investments', href: '/investments' },
      { label: 'Tax Center' },
    ]);
  });

  it('shows the record type for a detail route', () => {
    const trail = buildBreadcrumbTrail('/accounts/abc123');
    expect(trail).toEqual([{ label: 'Accounts', href: '/accounts' }, { label: 'Account' }]);
  });

  it('returns an empty trail for unknown routes', () => {
    expect(buildBreadcrumbTrail('/definitely-not-a-route')).toEqual([]);
    expect(buildBreadcrumbTrail('/')).toEqual([]);
  });

  it('localizes crumbs when a locale is supplied', () => {
    const trail = buildBreadcrumbTrail('/settings/preferences', 'es');
    expect(trail[0]?.label).toBe('Ajustes');
  });
});
