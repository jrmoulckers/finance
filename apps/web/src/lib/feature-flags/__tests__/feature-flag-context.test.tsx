// SPDX-License-Identifier: BUSL-1.1

import { renderHook } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { FeatureFlagProvider, useFeatureFlag } from '../feature-flag-context';
import type { WebFlagRegistry } from '../types';

const testRegistry: WebFlagRegistry = Object.freeze({
  on_flag: {
    key: 'on_flag',
    description: 'always on for web',
    enabled: true,
    owner: 'web',
    platforms: ['web'],
    rolloutPercentage: 100,
  },
  off_flag: {
    key: 'off_flag',
    description: 'disabled',
    enabled: false,
    owner: 'web',
    platforms: ['web'],
    rolloutPercentage: 100,
  },
});

function makeWrapper(): FC<{ children: ReactNode }> {
  return ({ children }) => (
    <FeatureFlagProvider registry={testRegistry} clientId="fixed-client">
      {children}
    </FeatureFlagProvider>
  );
}

describe('useFeatureFlag with a provider', () => {
  it('returns true for an enabled, fully rolled-out flag', () => {
    const { result } = renderHook(() => useFeatureFlag('on_flag'), { wrapper: makeWrapper() });
    expect(result.current).toBe(true);
  });

  it('returns false for a disabled flag', () => {
    const { result } = renderHook(() => useFeatureFlag('off_flag'), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });

  it('returns false (fail-closed) for an unknown flag', () => {
    const { result } = renderHook(() => useFeatureFlag('missing'), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });
});

describe('useFeatureFlag without a provider', () => {
  it('falls back to direct evaluation — live_bank_data is ramped on (100%)', () => {
    const { result } = renderHook(() => useFeatureFlag('live_bank_data'));
    expect(result.current).toBe(true);
  });
});
