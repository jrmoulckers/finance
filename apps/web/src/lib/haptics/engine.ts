// SPDX-License-Identifier: BUSL-1.1

import { getHapticPattern } from './patterns';
import type { HapticEventType, HapticIntensity, HapticPattern } from './types';

const ACTIVE_SEGMENT_SCALE: Readonly<Record<Exclude<HapticIntensity, 'off'>, number>> = {
  light: 0.7,
  medium: 1,
  strong: 1.35,
};

type VibrateNavigator = Pick<Navigator, 'vibrate'>;

function getVibrationNavigator(navigatorLike?: VibrateNavigator | null): VibrateNavigator | null {
  if (navigatorLike) {
    return navigatorLike;
  }

  return typeof navigator === 'undefined' ? null : navigator;
}

export function isHapticsSupported(navigatorLike?: VibrateNavigator | null): boolean {
  return typeof getVibrationNavigator(navigatorLike)?.vibrate === 'function';
}

export function resolveHapticPattern(
  eventType: HapticEventType,
  intensity: HapticIntensity,
): HapticPattern {
  if (intensity === 'off') {
    return [];
  }

  const basePattern = getHapticPattern(eventType);
  if (intensity === 'medium') {
    return basePattern;
  }

  const scale = ACTIVE_SEGMENT_SCALE[intensity];
  return basePattern.map((segment, index) =>
    index % 2 === 0 ? Math.max(1, Math.round(segment * scale)) : segment,
  );
}

export function playHapticPattern(
  pattern: HapticPattern,
  navigatorLike?: VibrateNavigator | null,
): boolean {
  const vibrationNavigator = getVibrationNavigator(navigatorLike);
  if (
    !vibrationNavigator ||
    pattern.length === 0 ||
    typeof vibrationNavigator.vibrate !== 'function'
  ) {
    return false;
  }

  return vibrationNavigator.vibrate([...pattern]);
}

export function triggerHaptic(
  eventType: HapticEventType,
  intensity: HapticIntensity,
  navigatorLike?: VibrateNavigator | null,
): boolean {
  return playHapticPattern(resolveHapticPattern(eventType, intensity), navigatorLike);
}

export function stopHaptics(navigatorLike?: VibrateNavigator | null): boolean {
  const vibrationNavigator = getVibrationNavigator(navigatorLike);
  if (!vibrationNavigator || typeof vibrationNavigator.vibrate !== 'function') {
    return false;
  }

  return vibrationNavigator.vibrate(0);
}
