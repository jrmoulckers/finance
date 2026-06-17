// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRegionalProfilePreference,
  getRegionalProfilePreference,
  getStoredRegionalProfile,
  setRegionalProfilePreference,
  suggestRegionalProfile,
} from './regional-profile-preferences';

describe('regional-profile-preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('suggests but does not force a regional profile from locale', () => {
    expect(suggestRegionalProfile('es-ES')).toBe('ES');
    expect(getRegionalProfilePreference('es-ES')).toBe('ES');
    setRegionalProfilePreference('CA');
    expect(getRegionalProfilePreference('es-ES')).toBe('CA');
  });

  it('persists and clears supported beta regional profiles independently', () => {
    expect(setRegionalProfilePreference('AU')).toBe('AU');
    expect(getStoredRegionalProfile()).toBe('AU');
    clearRegionalProfilePreference();
    expect(getStoredRegionalProfile()).toBeNull();
  });
});
