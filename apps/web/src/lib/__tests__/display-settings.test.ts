// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_KEY,
  formatAmountWithSettings,
  getAmountColor,
  loadDisplaySettings,
  saveDisplaySettings,
} from '../display-settings';
import type { MoneyDisplaySettings } from '../display-settings';

describe('display-settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  describe('loadDisplaySettings', () => {
    it('returns defaults when localStorage is empty', () => {
      expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS);
    });

    it('loads saved settings from localStorage', () => {
      const custom: MoneyDisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showDecimals: false,
        negativeFormat: 'parentheses',
      };
      localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(custom));

      const loaded = loadDisplaySettings();
      expect(loaded.showDecimals).toBe(false);
      expect(loaded.negativeFormat).toBe('parentheses');
    });

    it('falls back to defaults for invalid JSON', () => {
      localStorage.setItem(DISPLAY_SETTINGS_KEY, 'not-json');
      expect(loadDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS);
    });

    it('falls back to defaults for invalid field values', () => {
      localStorage.setItem(
        DISPLAY_SETTINGS_KEY,
        JSON.stringify({ negativeFormat: 'invalid', showDecimals: 'nope' }),
      );

      const loaded = loadDisplaySettings();
      expect(loaded.negativeFormat).toBe('minus');
      expect(loaded.showDecimals).toBe(true);
    });

    it('merges partial saved data with defaults', () => {
      localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ positiveColor: '#00ff00' }));

      const loaded = loadDisplaySettings();
      expect(loaded.positiveColor).toBe('#00ff00');
      expect(loaded.negativeColor).toBe(DEFAULT_DISPLAY_SETTINGS.negativeColor);
    });

    it('migrates the legacy negativeFormat "color-only" value to "text-label"', () => {
      localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ negativeFormat: 'color-only' }));

      expect(loadDisplaySettings().negativeFormat).toBe('text-label');
    });
  });

  describe('saveDisplaySettings', () => {
    it('persists settings to localStorage', () => {
      const custom: MoneyDisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        currencyDisplay: 'code',
      };
      saveDisplaySettings(custom);

      const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.currencyDisplay).toBe('code');
    });
  });

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  describe('formatAmountWithSettings', () => {
    const defaults = DEFAULT_DISPLAY_SETTINGS;

    it('formats a positive amount with defaults', () => {
      expect(formatAmountWithSettings(123456, defaults)).toBe('$1,234.56');
    });

    it('formats a negative amount with minus (default)', () => {
      expect(formatAmountWithSettings(-123456, defaults)).toBe('-$1,234.56');
    });

    it('formats zero', () => {
      expect(formatAmountWithSettings(0, defaults)).toBe('$0.00');
    });

    it('hides decimals when showDecimals is false', () => {
      const settings: MoneyDisplaySettings = { ...defaults, showDecimals: false };
      expect(formatAmountWithSettings(123456, settings)).toBe('$1,235');
    });

    it('wraps negative amounts in parentheses', () => {
      const settings: MoneyDisplaySettings = { ...defaults, negativeFormat: 'parentheses' };
      expect(formatAmountWithSettings(-123456, settings)).toBe('($1,234.56)');
    });

    it('uses color-independent text label format', () => {
      const settings: MoneyDisplaySettings = { ...defaults, negativeFormat: 'text-label' };
      expect(formatAmountWithSettings(-123456, settings)).toBe('Negative $1,234.56');
    });

    it('uses currency code display', () => {
      const settings: MoneyDisplaySettings = { ...defaults, currencyDisplay: 'code' };
      const formatted = formatAmountWithSettings(500, settings);
      expect(formatted).toContain('USD');
    });

    it('uses currency name display', () => {
      const settings: MoneyDisplaySettings = { ...defaults, currencyDisplay: 'name' };
      const formatted = formatAmountWithSettings(500, settings);
      // Intl.NumberFormat renders "US dollars" or similar
      expect(formatted.toLowerCase()).toContain('dollar');
    });
  });

  // ---------------------------------------------------------------------------
  // Color resolution
  // ---------------------------------------------------------------------------

  describe('getAmountColor', () => {
    it('returns positiveColor for positive amounts', () => {
      expect(getAmountColor(100, DEFAULT_DISPLAY_SETTINGS)).toBe(
        DEFAULT_DISPLAY_SETTINGS.positiveColor,
      );
    });

    it('returns negativeColor for negative amounts', () => {
      expect(getAmountColor(-100, DEFAULT_DISPLAY_SETTINGS)).toBe(
        DEFAULT_DISPLAY_SETTINGS.negativeColor,
      );
    });

    it('returns zeroColor for zero', () => {
      expect(getAmountColor(0, DEFAULT_DISPLAY_SETTINGS)).toBe(DEFAULT_DISPLAY_SETTINGS.zeroColor);
    });
  });
});
