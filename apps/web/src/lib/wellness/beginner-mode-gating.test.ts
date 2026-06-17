// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { decideBeginnerCurriculum } from './beginner-mode-gating';

const topics = [
  { id: 'first-paycheck', order: 1, risk: 'fundamental' as const, prerequisites: [] },
  { id: 'investing', order: 2, risk: 'advanced' as const, prerequisites: ['first-paycheck'] },
  { id: 'taxes', order: 3, risk: 'advanced' as const, prerequisites: ['first-paycheck'] },
];

describe('beginner mode curriculum gating', () => {
  it('gates teen beginner advanced topics unless opted in', () => {
    expect(decideBeginnerCurriculum(topics, { age: 16, persona: 'teen', expertiseTier: 'beginner', optedInAdvancedTopicIds: [], completedTopicIds: ['first-paycheck'] })).toEqual({
      eligibleTopicIds: ['first-paycheck'],
      copyToken: 'teen-beginner',
    });
  });

  it('allows adult opt-in and non-beginner advanced paths', () => {
    expect(decideBeginnerCurriculum(topics, { age: 30, persona: 'adult', expertiseTier: 'beginner', optedInAdvancedTopicIds: ['investing'], completedTopicIds: ['first-paycheck'] }).eligibleTopicIds).toEqual(['first-paycheck', 'investing']);
    expect(decideBeginnerCurriculum(topics, { age: 30, persona: 'adult', expertiseTier: 'intermediate', optedInAdvancedTopicIds: [], completedTopicIds: ['first-paycheck'] }).copyToken).toBe('standard');
  });
});
