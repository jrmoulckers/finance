// SPDX-License-Identifier: BUSL-1.1

/**
 * Public barrel export for the currency conversion infrastructure.
 *
 * References: issue #1515
 */

export type { ExchangeRate, ExchangeRateProvider, ConversionResult } from './exchange-rate-types';

export { StaticRateProvider, STATIC_CURRENCY_CODES } from './static-rates';

export {
  getCachedRate,
  setCachedRate,
  getCachedRates,
  setCachedRates,
  isCacheStale,
  getCacheTimestamp,
  clearRateCache,
  DEFAULT_CACHE_TTL_MS,
} from './rate-cache';

export { ExchangeRateService } from './exchange-rate-service';

export type { FxEntryMetadata } from './minor-units';
export type { FxCurrencyOption } from './entry-currencies';
export type { ConvertToBaseInput } from './fx-convert';

export {
  ENTRY_CURRENCY_CODES,
  getEntryCurrencyOptions,
  getCurrencyLabel,
  getCurrencySymbol,
} from './entry-currencies';

export {
  FX_FIELD_KEYS,
  normalizeCurrencyCode,
  getCurrencyDecimals,
  minorUnitFactor,
  parseAmountToMinorUnits,
  minorUnitsToMajorNumber,
  readFxMetadata,
  isFxFieldKey,
} from './minor-units';

export { roundToInteger, convertToBaseMinorUnits, buildFxCustomFields } from './fx-convert';
