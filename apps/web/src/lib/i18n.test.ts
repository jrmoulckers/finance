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

describe('accessible currency & glossary label i18n (#3304, #3309)', () => {
  it('translates the screen-reader negative prefix per locale with the amount placeholder', () => {
    expect(translate('a11y.currency.negative', { amount: '$12.34' }, 'en-US').text).toBe(
      'negative $12.34',
    );
    expect(translate('a11y.currency.negative', { amount: '12,34 €' }, 'es-ES')).toEqual({
      text: 'negativo 12,34 €',
      translated: true,
    });
    expect(translate('a11y.currency.negative', { amount: '¥88' }, 'zh-Hans')).toEqual({
      text: '负¥88',
      translated: true,
    });
  });

  it('translates the visible color-only negative cue and the masked-amount label', () => {
    expect(translate('currency.display.negativeCue', { amount: '$5.00' }, 'en-US').text).toBe(
      'Negative $5.00',
    );
    expect(translate('currency.display.amountHidden', {}, 'zh-Hans')).toEqual({
      text: '金额已隐藏',
      translated: true,
    });
  });

  it('translates the "Explain this" glossary popover chrome for bilingual readers', () => {
    expect(translate('education.explain.trigger', { term: 'APR' }, 'en-US').text).toBe(
      'Explain APR',
    );
    expect(translate('education.explain.example', {}, 'zh-Hans').text).toBe('示例');
    expect(translate('education.explain.whyItMatters', {}, 'es-ES').text).toBe(
      'Por qué es importante',
    );
    expect(translate('education.explain.close', { term: 'escrow' }, 'zh-Hans').text).toBe(
      '关闭escrow的解释',
    );
  });
});
