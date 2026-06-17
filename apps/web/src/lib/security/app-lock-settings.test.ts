// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APP_LOCK_STATE,
  buildPrivacySafeShell,
  normalizeAppLockSettings,
  reduceAppLockEvent,
} from './app-lock-settings';

describe('app lock settings helpers', () => {
  it('normalizes safe defaults and minimum idle timeout', () => {
    expect(normalizeAppLockSettings({ enabled: true, idleTimeoutMs: 1_000 })).toMatchObject({
      enabled: true,
      idleTimeoutMs: 30_000,
      lockOnResume: true,
      requirePasskey: true,
    });
  });

  it('locks manually with a privacy-safe shell and scrubbed audit metadata', () => {
    const settings = normalizeAppLockSettings({ enabled: true });
    const transition = reduceAppLockEvent(settings, DEFAULT_APP_LOCK_STATE, 'manual_lock', 1_000);

    expect(transition.state).toMatchObject({ locked: true, reason: 'manual' });
    expect(transition.shell.hideSensitiveValues).toBe(true);
    expect(transition.shell.body).toContain('separate from signing in');
    expect(transition.audit).toEqual({ event: 'app_locked', severity: 'info', metadata: { reason: 'manual' } });
  });

  it('locks on idle and resume policies without exposing sensitive metadata', () => {
    const settings = normalizeAppLockSettings({ enabled: true, idleTimeoutMs: 60_000, lockOnResume: true });
    const unlocked = reduceAppLockEvent(settings, DEFAULT_APP_LOCK_STATE, 'unlock_success', 1_000).state;

    expect(reduceAppLockEvent(settings, unlocked, 'idle_check', 30_000).state.locked).toBe(false);
    expect(reduceAppLockEvent(settings, unlocked, 'idle_check', 61_000).state.reason).toBe('idle_timeout');
    expect(reduceAppLockEvent(settings, unlocked, 'resume', 2_000).state.reason).toBe('resume');
  });

  it('explains disabled app lock separately from account login', () => {
    const settings = normalizeAppLockSettings({ enabled: false });

    expect(buildPrivacySafeShell(DEFAULT_APP_LOCK_STATE, settings)).toMatchObject({
      hideSensitiveValues: false,
      primaryAction: 'enable_app_lock',
    });
    expect(reduceAppLockEvent(settings, DEFAULT_APP_LOCK_STATE, 'manual_lock', 1_000).audit).toMatchObject({
      event: 'app_lock_bypassed',
      severity: 'warning',
    });
  });
});
