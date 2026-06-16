// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExchangeRateService } from './exchange-rate-service';
import type { ExchangeRateProvider } from './exchange-rate-types';
import { clearRateCache, setCachedRates } from './rate-cache';
import { LocalStoredRateProvider, saveLocalRateTable } from './local-stored-rate-provider';
import { StaticRateProvider } from './static-rates';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    localStorage.clear();
    service = new ExchangeRateService();
  });

  afterEach(() => {
    localStorage.clear();
    clearRateCache();
  });

  describe('convert', () => {
    it('returns the same amount for same currency', async () => {
      const result = await service.convert(10000, 'USD', 'USD');
      expect(result.amount).toBe(10000);
      expect(result.rate.rate).toBe(1);
    });

    it('converts USD to EUR correctly', async () => {
      const result = await service.convert(10000, 'USD', 'EUR');
      // 10000 cents * 0.92 ≈ 9200 cents
      expect(result.amount).toBe(9200);
      expect(result.rate.from).toBe('USD');
      expect(result.rate.to).toBe('EUR');
      expect(result.rate.source).toBe('stored');
    });

    it('converts EUR to USD correctly', async () => {
      const result = await service.convert(9200, 'EUR', 'USD');
      // 9200 cents / 0.92 ≈ 10000 cents
      expect(result.amount).toBe(10000);
    });

    it('handles zero amounts', async () => {
      const result = await service.convert(0, 'USD', 'EUR');
      expect(result.amount).toBe(0);
    });

    it('rounds to the nearest cent', async () => {
      // 1 cent USD to JPY = 1 * 149.5 = 149.5 → rounds to 150
      const result = await service.convert(1, 'USD', 'JPY');
      expect(result.amount).toBe(Math.round(149.5));
    });
  });

  describe('getRate', () => {
    it('returns rate 1 for same currency', async () => {
      const rate = await service.getRate('USD', 'USD');
      expect(rate.rate).toBe(1);
    });

    it('returns a valid exchange rate', async () => {
      const rate = await service.getRate('USD', 'EUR');
      expect(rate.rate).toBeCloseTo(0.92, 1);
      expect(rate.from).toBe('USD');
      expect(rate.to).toBe('EUR');
      expect(rate.source).toBe('stored');
      expect(rate.timestamp).toBeTruthy();
    });

    it('caches rate for subsequent lookups', async () => {
      const rate1 = await service.getRate('USD', 'EUR');
      const rate2 = await service.getRate('USD', 'EUR');
      expect(rate1.rate).toBe(rate2.rate);
    });
  });

  describe('getAllRates', () => {
    it('returns rates for all supported currencies', async () => {
      const rates = await service.getAllRates('USD');
      expect(Object.keys(rates).length).toBeGreaterThanOrEqual(29); // 30 - 1 (self)
      expect(rates['EUR']).toBeDefined();
      expect(rates['EUR'].rate).toBeCloseTo(0.92, 1);
    });

    it('does not include the base currency in results', async () => {
      const rates = await service.getAllRates('USD');
      expect(rates['USD']).toBeUndefined();
    });
  });

  describe('user overrides', () => {
    it('returns empty overrides by default', () => {
      expect(service.getUserOverrides()).toEqual({});
    });

    it('sets and retrieves a user override', () => {
      service.setUserOverride('USD', 'EUR', 0.95);
      const overrides = service.getUserOverrides();
      expect(overrides['USD:EUR']).toBe(0.95);
    });

    it('uses override rate in getRate', async () => {
      service.setUserOverride('USD', 'EUR', 0.95);
      const rate = await service.getRate('USD', 'EUR');
      expect(rate.rate).toBe(0.95);
      expect(rate.source).toBe('user-override');
    });

    it('uses override rate in convert', async () => {
      service.setUserOverride('USD', 'EUR', 0.95);
      const result = await service.convert(10000, 'USD', 'EUR');
      expect(result.amount).toBe(9500);
      expect(result.rate.source).toBe('user-override');
    });

    it('merges overrides into getAllRates', async () => {
      service.setUserOverride('USD', 'EUR', 0.95);
      const rates = await service.getAllRates('USD');
      expect(rates['EUR'].rate).toBe(0.95);
      expect(rates['EUR'].source).toBe('user-override');
      // Other rates should be unaffected
      expect(rates['GBP'].source).toBe('stored');
    });

    it('removes a user override', async () => {
      service.setUserOverride('USD', 'EUR', 0.95);
      service.removeUserOverride('USD', 'EUR');
      const rate = await service.getRate('USD', 'EUR');
      expect(rate.source).toBe('stored');
    });

    it('clears all overrides', () => {
      service.setUserOverride('USD', 'EUR', 0.95);
      service.setUserOverride('USD', 'GBP', 0.85);
      service.clearUserOverrides();
      expect(service.getUserOverrides()).toEqual({});
    });
  });

  describe('local stored provider', () => {
    it('uses a stored local rate table when present', async () => {
      saveLocalRateTable({
        baseCurrency: 'USD',
        rates: { EUR: 0.96 },
        updatedAt: '2024-01-01T00:00:00.000Z',
        source: 'test',
      });
      const localService = new ExchangeRateService(new LocalStoredRateProvider());

      const result = await localService.convert(10000, 'USD', 'EUR');

      expect(result.amount).toBe(9600);
      expect(result.rate.source).toBe('stored');
    });
  });

  describe('provider failure fallback', () => {
    it('falls back to stale cached rates when the provider fails', async () => {
      const staleTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      setCachedRates('USD', {
        EUR: { from: 'USD', to: 'EUR', rate: 0.91, timestamp: staleTimestamp, source: 'stored' },
      });
      const failingProvider: ExchangeRateProvider = {
        name: 'Failing API',
        fetchRates: async () => {
          throw new Error('network unavailable');
        },
        fetchRate: async () => {
          throw new Error('network unavailable');
        },
        isAvailable: async () => false,
      };
      const fallbackService = new ExchangeRateService(failingProvider, 0);

      const rates = await fallbackService.getAllRates('USD');
      const result = await fallbackService.convert(10000, 'USD', 'EUR');

      expect(rates['EUR'].rate).toBe(0.91);
      expect(result.amount).toBe(9100);
      expect(result.rate.source).toBe('stored');
    });
  });

  describe('providerName', () => {
    it('returns the provider name', () => {
      expect(service.providerName).toBe('Stored Exchange Rates');
    });

    it('returns custom provider name', () => {
      const customProvider = new StaticRateProvider();
      const customService = new ExchangeRateService(customProvider);
      expect(customService.providerName).toBe('Static Rates');
    });
  });
});
