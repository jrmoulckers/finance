// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { evaluateFlag } from '../evaluate';
import { computeBucket } from '../rollout';
import type { FlagEvaluationContext, WebFeatureFlag } from '../types';

const webContext: FlagEvaluationContext = { clientId: 'client-1', platform: 'web' };

function flag(overrides: Partial<WebFeatureFlag> = {}): WebFeatureFlag {
  return {
    key: 'test_flag',
    description: 'test',
    enabled: true,
    owner: 'web',
    platforms: ['web'],
    rolloutPercentage: 100,
    ...overrides,
  };
}

describe('evaluateFlag', () => {
  it('is false when the master switch is off, regardless of rollout', () => {
    expect(evaluateFlag(flag({ enabled: false, rolloutPercentage: 100 }), webContext)).toBe(false);
  });

  it('is false when the platform is not targeted', () => {
    expect(evaluateFlag(flag({ platforms: ['android', 'ios'] }), webContext)).toBe(false);
  });

  it('is true when enabled, platform-targeted, and fully rolled out', () => {
    expect(evaluateFlag(flag({ rolloutPercentage: 100 }), webContext)).toBe(true);
  });

  it('is false when enabled and platform-targeted but rolled out to 0%', () => {
    expect(evaluateFlag(flag({ rolloutPercentage: 0 }), webContext)).toBe(false);
  });

  it('respects the deterministic rollout bucket for partial rollouts', () => {
    const bucket = computeBucket(webContext.clientId, 'test_flag');
    expect(evaluateFlag(flag({ rolloutPercentage: bucket + 1 }), webContext)).toBe(true);
    expect(evaluateFlag(flag({ rolloutPercentage: bucket }), webContext)).toBe(false);
  });
});
