// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  getCurrentLocale,
  getCurrentTimeZone,
  normalizeLocale,
  setLocalePreference,
  setTimeZonePreference,
  translate,
} from './i18n';

describe('i18n locale preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('detects the first supported browser locale with regional fallback', () => {
    expect(detectBrowserLocale(['fr-CA', 'es-MX', 'en-US'])).toBe('es-ES');
  });

  it('falls back safely for unsupported locales', () => {
    expect(normalizeLocale('zz-ZZ')).toBeNull();
    expect(detectBrowserLocale(['zz-ZZ'])).toBe(DEFAULT_LOCALE);
  });

  it('persists and returns the selected locale', () => {
    setLocalePreference('de-DE');
    expect(getCurrentLocale()).toBe('de-DE');
  });

  it('persists and returns the selected time zone', () => {
    setTimeZonePreference('Asia/Tokyo');
    expect(getCurrentTimeZone()).toBe('Asia/Tokyo');
  });

  it('translates Spanish locale keys and reports fallback', () => {
    expect(translate('settings.language', {}, 'es-ES')).toEqual({
      text: 'Idioma',
      translated: true,
    });
    expect(translate('tips.account-create-first.title', {}, 'de-DE')).toEqual({
      text: 'Add your first account',
      translated: false,
    });
  });

  it('offers Simplified Chinese and normalizes regional Chinese tags to it', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh-Hans');
    expect(normalizeLocale('zh-CN')).toBe('zh-Hans');
    expect(normalizeLocale('zh')).toBe('zh-Hans');
    expect(translate('nav.remittances', {}, 'zh-Hans')).toEqual({
      text: '汇款',
      translated: true,
    });
  });
});
