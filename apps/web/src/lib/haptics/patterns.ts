// SPDX-License-Identifier: BUSL-1.1

import type { HapticEventType, HapticPattern, HapticPatternMap } from './types';

export const HAPTIC_PATTERNS = {
  budget_warning: [100, 50, 100],
  budget_critical: [150, 50, 150, 50, 150],
  budget_exceeded: [300, 100, 300],
  goal_reached: [50, 30, 50, 30, 50, 30, 200],
  savings_milestone: [80, 40, 80],
} satisfies HapticPatternMap;

export function getHapticPattern(eventType: HapticEventType): HapticPattern {
  return HAPTIC_PATTERNS[eventType];
}
