// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IdleSessionController,
  STEP_UP_WINDOW_MS,
  getStepUpStatus,
  loadIdleSessionPolicy,
  markStepUpAuthenticated,
  saveIdleSessionPolicy,
} from './session-security';

describe('session-security', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('requires step-up until a recent re-authentication is recorded', async () => {
    const now = new Date('2026-05-26T12:00:00Z');

    expect(getStepUpStatus('data_export', now).allowed).toBe(false);
    await markStepUpAuthenticated('data_export', {}, now);
    expect(
      getStepUpStatus('data_export', new Date(now.getTime() + STEP_UP_WINDOW_MS - 1)).allowed,
    ).toBe(true);
    expect(
      getStepUpStatus('data_export', new Date(now.getTime() + STEP_UP_WINDOW_MS + 1)).allowed,
    ).toBe(false);
  });

  it('normalizes and persists idle timeout settings', () => {
    saveIdleSessionPolicy({ timeoutMs: 5 * 60_000, warningMs: 60_000, lockBehavior: 'logout' });

    expect(loadIdleSessionPolicy()).toMatchObject({ timeoutMs: 300000, warningMs: 60000 });
  });

  it('warns before timing out and cancels warning on activity', () => {
    let now = 0;
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    const controller = new IdleSessionController({
      policy: { timeoutMs: 10_000, warningMs: 2_000, lockBehavior: 'logout' },
      now: () => now,
      onWarning,
      onTimeout,
    });

    now = 8_500;
    expect(controller.check()).toBe('warning');
    expect(onWarning).toHaveBeenCalledWith(1500);
    controller.recordActivity();
    now = 9_000;
    expect(controller.check()).toBe('active');
    now = 20_000;
    expect(controller.check()).toBe('timed_out');
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
