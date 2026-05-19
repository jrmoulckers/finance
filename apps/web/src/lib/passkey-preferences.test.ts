// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearPasskeyPreferences,
  getLoginCount,
  getPasskeyPromptState,
  hasRegisteredPasskey,
  incrementLoginCount,
  setHasRegisteredPasskey,
  setPasskeyPromptState,
  shouldShowPasskeyPrompt,
} from './passkey-preferences';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('passkey-preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -----------------------------------------------------------------------
  // getPasskeyPromptState / setPasskeyPromptState
  // -----------------------------------------------------------------------

  describe('getPasskeyPromptState', () => {
    it('returns "show" by default', () => {
      expect(getPasskeyPromptState()).toBe('show');
    });

    it('returns "remind" after being set', () => {
      setPasskeyPromptState('remind');
      expect(getPasskeyPromptState()).toBe('remind');
    });

    it('returns "skipped" after being set', () => {
      setPasskeyPromptState('skipped');
      expect(getPasskeyPromptState()).toBe('skipped');
    });
  });

  describe('setPasskeyPromptState', () => {
    it('resets login count when set to "remind"', () => {
      incrementLoginCount();
      incrementLoginCount();
      expect(getLoginCount()).toBe(2);

      setPasskeyPromptState('remind');
      expect(getLoginCount()).toBe(0);
    });

    it('does not reset login count when set to "skipped"', () => {
      incrementLoginCount();
      incrementLoginCount();

      setPasskeyPromptState('skipped');
      expect(getLoginCount()).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // incrementLoginCount / getLoginCount
  // -----------------------------------------------------------------------

  describe('incrementLoginCount', () => {
    it('starts at 0 and increments', () => {
      expect(getLoginCount()).toBe(0);
      expect(incrementLoginCount()).toBe(1);
      expect(incrementLoginCount()).toBe(2);
      expect(incrementLoginCount()).toBe(3);
      expect(getLoginCount()).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // hasRegisteredPasskey / setHasRegisteredPasskey
  // -----------------------------------------------------------------------

  describe('hasRegisteredPasskey', () => {
    it('returns false by default', () => {
      expect(hasRegisteredPasskey()).toBe(false);
    });

    it('returns true after setHasRegisteredPasskey()', () => {
      setHasRegisteredPasskey();
      expect(hasRegisteredPasskey()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // shouldShowPasskeyPrompt
  // -----------------------------------------------------------------------

  describe('shouldShowPasskeyPrompt', () => {
    it('returns true for new users (default state)', () => {
      expect(shouldShowPasskeyPrompt()).toBe(true);
    });

    it('returns false when user has registered a passkey', () => {
      setHasRegisteredPasskey();
      expect(shouldShowPasskeyPrompt()).toBe(false);
    });

    it('returns false when user chose "Skip"', () => {
      setPasskeyPromptState('skipped');
      expect(shouldShowPasskeyPrompt()).toBe(false);
    });

    it('returns false when "remind" and login count < 3', () => {
      setPasskeyPromptState('remind');
      incrementLoginCount();
      incrementLoginCount();
      expect(shouldShowPasskeyPrompt()).toBe(false);
    });

    it('returns true when "remind" and login count >= 3', () => {
      setPasskeyPromptState('remind');
      incrementLoginCount();
      incrementLoginCount();
      incrementLoginCount();
      expect(shouldShowPasskeyPrompt()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // clearPasskeyPreferences
  // -----------------------------------------------------------------------

  describe('clearPasskeyPreferences', () => {
    it('resets all preferences', () => {
      setPasskeyPromptState('skipped');
      setHasRegisteredPasskey();
      incrementLoginCount();

      clearPasskeyPreferences();

      expect(getPasskeyPromptState()).toBe('show');
      expect(hasRegisteredPasskey()).toBe(false);
      expect(getLoginCount()).toBe(0);
    });
  });
});
