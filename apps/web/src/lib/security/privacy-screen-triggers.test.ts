// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
  DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE,
  inferScreenShareActive,
  matchesPrivacyScreenShortcut,
  reducePrivacyScreenTrigger,
} from './privacy-screen-triggers';

describe('privacy screen triggers', () => {
  it('toggles immediately without transition-frame sensitive rendering', () => {
    const on = reducePrivacyScreenTrigger(
      DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
      DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE,
      'manual_toggle',
    );

    expect(on.state.masked).toBe(true);
    expect(on.state.renderSensitiveValues).toBe(false);
    expect(on.announce).toContain('Sensitive values are hidden');

    const off = reducePrivacyScreenTrigger(
      DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
      on.state,
      'keyboard_shortcut',
    );
    expect(off.state.masked).toBe(false);
    expect(off.state.renderSensitiveValues).toBe(true);
  });

  it('masks on background, resume, and screen-share heuristics by default', () => {
    let result = reducePrivacyScreenTrigger(
      DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
      DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE,
      'background',
    );
    expect(result.state.masked).toBe(true);

    result = reducePrivacyScreenTrigger(
      DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
      DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE,
      'resume',
    );
    expect(result.state.renderSensitiveValues).toBe(false);

    result = reducePrivacyScreenTrigger(
      DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
      DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE,
      'screen_share_start',
    );
    expect(result.state.masked).toBe(true);
    expect(
      reducePrivacyScreenTrigger(
        DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS,
        result.state,
        'screen_share_stop',
      ).state.masked,
    ).toBe(false);
  });

  it('recognizes accessible shortcut and display-surface signals', () => {
    expect(
      matchesPrivacyScreenShortcut({
        altKey: true,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        key: 'P',
      }),
    ).toBe(true);
    expect(
      matchesPrivacyScreenShortcut({
        altKey: false,
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        key: 'P',
      }),
    ).toBe(false);
    expect(inferScreenShareActive({ displaySurface: 'monitor' })).toBe(true);
    expect(inferScreenShareActive(undefined)).toBe(false);
  });

  it('keeps safe defaults when privacy screen is disabled', () => {
    const result = reducePrivacyScreenTrigger(
      { ...DEFAULT_PRIVACY_SCREEN_TRIGGER_SETTINGS, enabled: false },
      { ...DEFAULT_PRIVACY_SCREEN_TRIGGER_STATE, masked: true, renderSensitiveValues: false },
      'background',
    );

    expect(result.state.masked).toBe(false);
    expect(result.state.renderSensitiveValues).toBe(true);
  });
});
