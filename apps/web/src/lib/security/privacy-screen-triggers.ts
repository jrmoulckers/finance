// SPDX-License-Identifier: BUSL-1.1

export type PrivacyScreenTriggerEvent =
  | 'manual_toggle'
  | 'keyboard_shortcut'
  | 'background'
  | 'resume'
  | 'screen_share_start'
  | 'screen_share_stop';

export interface PrivacyScreenTriggerSettings {
  readonly enabled: boolean;
  readonly quickToggleEnabled: boolean;
  readonly shortcut: string;
  readonly maskOnBackground: boolean;
  readonly maskOnResume: boolean;
  readonly maskOnScreenShare: boolean;
}

export interface PrivacyScreenTriggerState {
  readonly masked: boolean;
  readonly lastTrigger: PrivacyScreenTriggerEvent | null;
  readonly renderSensitiveValues: boolean;
}

export interface PrivacyScreenTriggerResult {
  readonly state: PrivacyScreenTriggerState;
  readonly announce: string;
}

export const DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS: PrivacyScreenTriggerSettings = {
  enabled: true,
  quickToggleEnabled: true,
  shortcut: 'Alt+Shift+P',
  maskOnBackground: true,
  maskOnResume: true,
  maskOnScreenShare: true,
};

export const DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE: PrivacyScreenTriggerState = {
  masked: false,
  lastTrigger: null,
  renderSensitiveValues: true,
};

export function reducePrivacyScreenTrigger(
  settings: PrivacyScreenTriggerSettings,
  state: PrivacyScreenTriggerState,
  event: PrivacyScreenTriggerEvent,
): PrivacyScreenTriggerResult {
  if (!settings.enabled)
    return result(
      { ...state, masked: false, renderSensitiveValues: true, lastTrigger: event },
      'Privacy screen is off.',
    );

  if ((event === 'manual_toggle' || event === 'keyboard_shortcut') && settings.quickToggleEnabled) {
    return buildMaskedState(!state.masked, event);
  }
  if (event === 'background' && settings.maskOnBackground) return buildMaskedState(true, event);
  if (event === 'resume' && settings.maskOnResume) return buildMaskedState(true, event);
  if (event === 'screen_share_start' && settings.maskOnScreenShare)
    return buildMaskedState(true, event);
  if (event === 'screen_share_stop' && state.lastTrigger === 'screen_share_start')
    return buildMaskedState(false, event);

  return result(state, state.masked ? 'Privacy screen remains on.' : 'Privacy screen remains off.');
}

export function matchesPrivacyScreenShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'key'>,
  shortcut = 'Alt+Shift+P',
): boolean {
  const normalized = shortcut.toLowerCase();
  return (
    normalized === 'alt+shift+p' &&
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === 'p'
  );
}

export function inferScreenShareActive(
  trackSettings: Pick<MediaTrackSettings, 'displaySurface'> | undefined,
): boolean {
  return (
    trackSettings?.displaySurface === 'monitor' ||
    trackSettings?.displaySurface === 'window' ||
    trackSettings?.displaySurface === 'browser'
  );
}

function buildMaskedState(
  masked: boolean,
  trigger: PrivacyScreenTriggerEvent,
): PrivacyScreenTriggerResult {
  return result(
    { masked, lastTrigger: trigger, renderSensitiveValues: !masked },
    masked
      ? 'Privacy screen on. Sensitive values are hidden.'
      : 'Privacy screen off. Sensitive values are visible.',
  );
}

function result(state: PrivacyScreenTriggerState, announce: string): PrivacyScreenTriggerResult {
  return { state: { ...state, renderSensitiveValues: !state.masked }, announce };
}
