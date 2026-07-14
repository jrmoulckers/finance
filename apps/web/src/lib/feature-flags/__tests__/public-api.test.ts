// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_ID_STORAGE_KEY, getStableClientId } from '../client-id';
import { isFeatureEnabled, isFeatureEnabledWith } from '../index';
import type { WebFlagRegistry } from '../types';

const registry: WebFlagRegistry = Object.freeze({
  web_on: {
    key: 'web_on',
    description: 'on for web',
    enabled: true,
    owner: 'web',
    platforms: ['web'],
    rolloutPercentage: 100,
  },
  android_only: {
    key: 'android_only',
    description: 'android only',
    enabled: true,
    owner: 'android',
    platforms: ['android'],
    rolloutPercentage: 100,
  },
});

describe('isFeatureEnabledWith', () => {
  it('resolves a known enabled web flag to true', () => {
    expect(isFeatureEnabledWith('web_on', { clientId: 'c', platform: 'web' }, registry)).toBe(true);
  });

  it('resolves an unknown flag to false (fail-closed)', () => {
    expect(isFeatureEnabledWith('nope', { clientId: 'c', platform: 'web' }, registry)).toBe(false);
  });

  it('respects the platform filter', () => {
    expect(isFeatureEnabledWith('android_only', { clientId: 'c', platform: 'web' }, registry)).toBe(
      false,
    );
  });
});

describe('isFeatureEnabled (default registry)', () => {
  it('reports live_bank_data as off — dark-launched at 0% rollout', () => {
    expect(isFeatureEnabled('live_bank_data')).toBe(false);
  });
});

describe('getStableClientId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists and reuses a single id across calls', () => {
    const first = getStableClientId();
    const second = getStableClientId();
    expect(first).toBe(second);
    expect(localStorage.getItem(CLIENT_ID_STORAGE_KEY)).toBe(first);
  });
});
