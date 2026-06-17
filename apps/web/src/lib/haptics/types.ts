// SPDX-License-Identifier: BUSL-1.1

export type HapticEventType =
  | 'budget_warning'
  | 'budget_critical'
  | 'budget_exceeded'
  | 'goal_reached'
  | 'savings_milestone';

export type HapticPattern = readonly number[];

export type HapticIntensity = 'off' | 'light' | 'medium' | 'strong';

export interface HapticPreferences {
  readonly intensity: HapticIntensity;
}

export type HapticPatternMap = Readonly<Record<HapticEventType, HapticPattern>>;
