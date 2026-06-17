// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { createSettingsCopy, getSettingsCopy, SETTINGS_COPY_IDS } from './settings-catalog';

describe('settings-catalog', () => {
  it('provides typed access to settings and accessibility copy', () => {
    expect(SETTINGS_COPY_IDS.currencyRatesRetryAria).toBe('settings.currencyRates.retryAria');
    expect(getSettingsCopy('currencyLabel', 'en-US')).toBe('Currency');
  });

  it('falls back to English while preserving localized labels', () => {
    const copy = createSettingsCopy('es-ES');

    expect(copy.text('currencyRatesTitle')).toBe('Tipos de cambio');
    expect(copy.text('currencyRatesTableAria', { baseCurrency: 'USD' })).toBe('Tipos de cambio desde USD');
    expect(copy.sourceLabel('user-override')).toBe('Manual');
  });
});
