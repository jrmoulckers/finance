// SPDX-License-Identifier: BUSL-1.1

/**
 * User-configurable money display settings.
 *
 * Manages how monetary amounts are formatted and colored throughout
 * the application. Settings persist in localStorage and are distributed
 * via React context so every `CurrencyDisplay` instance reflects the
 * user's preferences.
 *
 * References: issue #1512
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { FC, ReactNode } from 'react';
import { getCurrencyFractionDigits, minorUnitFactor } from './currency-metadata';
import { getCurrentLocale } from './i18n';
import { formatAmount, MaskingMode } from './ui/privacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How negative amounts are visually indicated (besides color). */
export type NegativeFormat = 'minus' | 'parentheses' | 'text-label';

/** How the currency identifier is displayed. */
export type CurrencyDisplayMode = 'symbol' | 'code' | 'name';

/** User-configurable display preferences for monetary amounts. */
export interface MoneyDisplaySettings {
  /** CSS color applied to positive amounts. */
  positiveColor: string;
  /** CSS color applied to negative amounts. */
  negativeColor: string;
  /** CSS color applied to zero amounts. */
  zeroColor: string;
  /** Whether to show decimal places (cents). */
  showDecimals: boolean;
  /** How negative values are formatted. */
  negativeFormat: NegativeFormat;
  /** How the currency identifier is rendered ($ vs USD vs US Dollar). */
  currencyDisplay: CurrencyDisplayMode;
}

/** Context value exposed by `MoneyDisplayProvider`. */
export interface MoneyDisplayContextValue extends MoneyDisplaySettings {
  /** Replace one or more settings. Merges with existing values. */
  updateSettings: (patch: Partial<MoneyDisplaySettings>) => void;
  /** Reset all settings to defaults. */
  resetSettings: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** localStorage key used for persistence. */
export const DISPLAY_SETTINGS_KEY = 'finance_display_settings';

/** Default settings applied when no user override exists. */
export const DEFAULT_DISPLAY_SETTINGS: MoneyDisplaySettings = {
  positiveColor: 'var(--semantic-amount-positive, var(--color-success))',
  negativeColor: 'var(--semantic-amount-negative, var(--color-danger))',
  zeroColor: 'var(--semantic-text-secondary, var(--color-text-secondary))',
  showDecimals: true,
  negativeFormat: 'minus',
  currencyDisplay: 'symbol',
};

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Load saved settings from localStorage, merging with defaults.
 *
 * Invalid or missing keys fall back to the default value so the
 * application never sees an incomplete settings object.
 */
export function loadDisplaySettings(): MoneyDisplaySettings {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_SETTINGS };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_DISPLAY_SETTINGS };
    }

    const obj = parsed as Record<string, unknown>;

    return {
      positiveColor:
        typeof obj.positiveColor === 'string'
          ? obj.positiveColor
          : DEFAULT_DISPLAY_SETTINGS.positiveColor,
      negativeColor:
        typeof obj.negativeColor === 'string'
          ? obj.negativeColor
          : DEFAULT_DISPLAY_SETTINGS.negativeColor,
      zeroColor:
        typeof obj.zeroColor === 'string' ? obj.zeroColor : DEFAULT_DISPLAY_SETTINGS.zeroColor,
      showDecimals:
        typeof obj.showDecimals === 'boolean'
          ? obj.showDecimals
          : DEFAULT_DISPLAY_SETTINGS.showDecimals,
      negativeFormat: normalizeNegativeFormat(obj.negativeFormat),
      currencyDisplay: isCurrencyDisplayMode(obj.currencyDisplay)
        ? obj.currencyDisplay
        : DEFAULT_DISPLAY_SETTINGS.currencyDisplay,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

/** Persist the full settings object to localStorage. */
export function saveDisplaySettings(settings: MoneyDisplaySettings): void {
  try {
    localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage quota exceeded or private browsing — silently degrade.
  }
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Type guard for `NegativeFormat`. */
function isNegativeFormat(value: unknown): value is NegativeFormat {
  return value === 'minus' || value === 'parentheses' || value === 'text-label';
}

/**
 * Migrate the legacy `'color-only'` enum value to its accurate `'text-label'`
 * name. The option always rendered a `Negative …` text prefix (never color
 * alone), so `'color-only'` was a misnomer (#3283). Persisted preferences are
 * mapped forward transparently.
 */
function normalizeNegativeFormat(value: unknown): NegativeFormat {
  const migrated = value === 'color-only' ? 'text-label' : value;
  return isNegativeFormat(migrated) ? migrated : DEFAULT_DISPLAY_SETTINGS.negativeFormat;
}

/** Type guard for `CurrencyDisplayMode`. */
function isCurrencyDisplayMode(value: unknown): value is CurrencyDisplayMode {
  return value === 'symbol' || value === 'code' || value === 'name';
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format an integer cents amount using the user's display settings.
 *
 * This is the core formatting function consumed by `CurrencyDisplay`.
 * It delegates to `Intl.NumberFormat` but adjusts output based on the
 * active `MoneyDisplaySettings`.
 */
export function formatAmountWithSettings(
  amountInCents: number,
  settings: MoneyDisplaySettings,
  options: { currency?: string; locale?: string; signDisplay?: string } = {},
): string {
  const { currency = 'USD', locale = getCurrentLocale() } = options;

  const fractionDigits = settings.showDecimals ? getCurrencyFractionDigits(currency) : 0;

  // Determine the absolute value for formatting when we need custom sign handling
  const isNegative = amountInCents < 0;
  const absAmountInCents = Math.abs(amountInCents);
  const absValue = absAmountInCents / minorUnitFactor(currency) || 0;

  const formatted = formatAmount(
    Math.round(absValue * minorUnitFactor(currency)),
    MaskingMode.Visible,
    locale,
    {
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      signDisplay: 'never',
      currencyDisplay: settings.currencyDisplay,
    },
  );

  if (!isNegative) {
    return formatted;
  }

  // Apply the user's chosen negative format
  switch (settings.negativeFormat) {
    case 'parentheses':
      return `(${formatted})`;
    case 'text-label':
      return `Negative ${formatted}`;
    case 'minus':
    default:
      return `-${formatted}`;
  }
}

/**
 * Determine the CSS color to apply for a given amount.
 *
 * Returns the appropriate color from the user's settings based on
 * whether the amount is positive, negative, or zero.
 */
export function getAmountColor(
  amountInCents: number,
  settings: MoneyDisplaySettings,
): string | undefined {
  if (amountInCents > 0) return settings.positiveColor;
  if (amountInCents < 0) return settings.negativeColor;
  return settings.zeroColor;
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

const MoneyDisplayContext = createContext<MoneyDisplayContextValue | null>(null);

/** Props for the MoneyDisplayProvider component. */
export interface MoneyDisplayProviderProps {
  children?: ReactNode;
  /** Override initial settings (useful for testing). */
  initialSettings?: Partial<MoneyDisplaySettings>;
}

/**
 * Provides money display settings to all descendant components.
 *
 * Wraps the application (or a subtree) so that `useMoneyDisplay()` can
 * access and mutate the shared display preferences. Changes are
 * automatically persisted to localStorage.
 */
export const MoneyDisplayProvider: FC<MoneyDisplayProviderProps> = ({
  children,
  initialSettings,
}) => {
  const [settings, setSettings] = useState<MoneyDisplaySettings>(() => ({
    ...loadDisplaySettings(),
    ...initialSettings,
  }));

  // Persist whenever settings change (skip the initial mount value).
  useEffect(() => {
    saveDisplaySettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<MoneyDisplaySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_DISPLAY_SETTINGS });
  }, []);

  const value = useMemo<MoneyDisplayContextValue>(
    () => ({
      ...settings,
      updateSettings,
      resetSettings,
    }),
    [settings, updateSettings, resetSettings],
  );

  return createElement(MoneyDisplayContext.Provider, { value }, children);
};

/**
 * Access the current money display settings and updater functions.
 *
 * Must be used within a `MoneyDisplayProvider`. If no provider is found
 * (e.g. in unit tests), returns sensible defaults so components don't crash.
 */
export function useMoneyDisplay(): MoneyDisplayContextValue {
  const ctx = useContext(MoneyDisplayContext);

  if (ctx) return ctx;

  // Graceful fallback — lets CurrencyDisplay render without a provider
  // (important for existing tests and Storybook).
  return {
    ...DEFAULT_DISPLAY_SETTINGS,
    updateSettings: () => {},
    resetSettings: () => {},
  };
}
