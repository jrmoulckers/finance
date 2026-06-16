// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  getRegionalConvention,
  getRegionalConventionForLocale,
  getRegionForLocale,
  REGIONAL_CONVENTIONS,
} from './regional-conventions';

describe('regional conventions', () => {
  it('defines beta regional profiles for core tax and reporting assumptions', () => {
    expect(Object.keys(REGIONAL_CONVENTIONS).sort()).toEqual(['AU', 'CA', 'ES', 'EU', 'GB', 'US']);
    expect(getRegionalConvention('GB').taxYearStart).toEqual({ month: 4, day: 6 });
    expect(getRegionalConvention('AU').fiscalYearStart).toEqual({ month: 7, day: 1 });
    expect(getRegionalConvention('ES').taxTerms.indirectTax).toBe('IVA');
  });

  it('maps locales to regional profiles without coupling language to currency', () => {
    expect(getRegionForLocale('es-ES')).toBe('ES');
    expect(getRegionalConventionForLocale('fr-CA').defaultCurrency).toBe('CAD');
    expect(getRegionalConventionForLocale('en-US').weekStartsOn).toBe(0);
  });
});
