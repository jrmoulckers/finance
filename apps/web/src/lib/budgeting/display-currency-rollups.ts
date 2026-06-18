// SPDX-License-Identifier: BUSL-1.1

import { bankersRound } from './utils';

export type CurrencyConversionSource = 'static' | 'stored' | 'api' | 'user-override' | 'offline';

export interface DisplayCurrencyAmount {
  readonly id: string;
  readonly amountCents: number;
  readonly currency: string;
}

export interface DisplayExchangeRate {
  readonly from: string;
  readonly to: string;
  readonly rate: number;
  readonly timestamp: string;
  readonly source: CurrencyConversionSource;
}

export interface ConvertedDisplayAmount extends DisplayCurrencyAmount {
  readonly displayAmountCents: number;
  readonly displayCurrency: string;
  readonly rate: DisplayExchangeRate;
  readonly stale: boolean;
}

export interface DisplayCurrencyRollup {
  readonly displayCurrency: string;
  readonly totalCents: number;
  readonly originalTotalsByCurrency: Readonly<Record<string, number>>;
  readonly convertedAmounts: readonly ConvertedDisplayAmount[];
  readonly convertedCurrencyCodes: readonly string[];
  readonly hasMixedCurrencies: boolean;
  readonly hasStaleRates: boolean;
  readonly rateSources: readonly CurrencyConversionSource[];
  readonly oldestRateTimestamp: string | null;
  readonly disclosure: string;
}

export interface BudgetDisplayRollup extends DisplayCurrencyRollup {
  readonly budgetedCents: number;
  readonly spentCents: number;
  readonly remainingCents: number;
}

export interface DashboardDisplayRollup {
  readonly netWorth: DisplayCurrencyRollup;
  readonly cashFlow: DisplayCurrencyRollup;
}

export interface DisplayCurrencyRollupOptions {
  readonly staleAfter?: string;
}

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function isStale(rate: DisplayExchangeRate, staleAfter?: string): boolean {
  return rate.source === 'offline' || (staleAfter !== undefined && rate.timestamp < staleAfter);
}

function identityRate(currency: string): DisplayExchangeRate {
  return { from: currency, to: currency, rate: 1, timestamp: '', source: 'static' };
}

function findRate(
  fromCurrency: string,
  toCurrency: string,
  rates: readonly DisplayExchangeRate[],
): DisplayExchangeRate {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  if (from === to) return identityRate(to);

  const direct = rates.find(
    (rate) => normalizeCurrency(rate.from) === from && normalizeCurrency(rate.to) === to,
  );
  if (direct) return { ...direct, from, to };

  const inverse = rates.find(
    (rate) => normalizeCurrency(rate.from) === to && normalizeCurrency(rate.to) === from,
  );
  if (inverse && inverse.rate !== 0) {
    return {
      from,
      to,
      rate: 1 / inverse.rate,
      timestamp: inverse.timestamp,
      source: inverse.source,
    };
  }

  throw new Error(`Missing exchange rate from ${from} to ${to}.`);
}

export function convertDisplayCurrencyAmount(
  amount: DisplayCurrencyAmount,
  displayCurrency: string,
  rates: readonly DisplayExchangeRate[],
  options: DisplayCurrencyRollupOptions = {},
): ConvertedDisplayAmount {
  const sourceCurrency = normalizeCurrency(amount.currency);
  const targetCurrency = normalizeCurrency(displayCurrency);
  const rate = findRate(sourceCurrency, targetCurrency, rates);

  return {
    ...amount,
    currency: sourceCurrency,
    displayAmountCents: bankersRound(amount.amountCents * rate.rate),
    displayCurrency: targetCurrency,
    rate,
    stale: isStale(rate, options.staleAfter),
  };
}

export function aggregateDisplayCurrencyAmounts(
  amounts: readonly DisplayCurrencyAmount[],
  displayCurrency: string,
  rates: readonly DisplayExchangeRate[],
  options: DisplayCurrencyRollupOptions = {},
): DisplayCurrencyRollup {
  const targetCurrency = normalizeCurrency(displayCurrency);
  const convertedAmounts = amounts.map((amount) =>
    convertDisplayCurrencyAmount(amount, targetCurrency, rates, options),
  );
  const originalTotalsByCurrency = convertedAmounts.reduce<Record<string, number>>(
    (totals, amount) => {
      totals[amount.currency] = (totals[amount.currency] ?? 0) + amount.amountCents;
      return totals;
    },
    {},
  );
  const convertedCurrencyCodes = [
    ...new Set(
      convertedAmounts
        .filter((amount) => amount.currency !== targetCurrency)
        .map((amount) => amount.currency),
    ),
  ].sort();
  const rateSources = [...new Set(convertedAmounts.map((amount) => amount.rate.source))].sort();
  const rateTimestamps = convertedAmounts
    .map((amount) => amount.rate.timestamp)
    .filter((timestamp) => timestamp.length > 0)
    .sort();
  const hasStaleRates = convertedAmounts.some((amount) => amount.stale);
  const totalCents = convertedAmounts.reduce((sum, amount) => sum + amount.displayAmountCents, 0);

  return {
    displayCurrency: targetCurrency,
    totalCents,
    originalTotalsByCurrency,
    convertedAmounts,
    convertedCurrencyCodes,
    hasMixedCurrencies: Object.keys(originalTotalsByCurrency).length > 1,
    hasStaleRates,
    rateSources,
    oldestRateTimestamp: rateTimestamps[0] ?? null,
    disclosure: buildDisclosure(
      targetCurrency,
      convertedCurrencyCodes,
      hasStaleRates,
      rateTimestamps[0] ?? null,
    ),
  };
}

export function calculateBudgetDisplayRollup(
  rows: readonly {
    readonly id: string;
    readonly budgetedCents: number;
    readonly spentCents: number;
    readonly currency: string;
  }[],
  displayCurrency: string,
  rates: readonly DisplayExchangeRate[],
  options: DisplayCurrencyRollupOptions = {},
): BudgetDisplayRollup {
  const budgeted = aggregateDisplayCurrencyAmounts(
    rows.map((row) => ({
      id: `${row.id}:budgeted`,
      amountCents: row.budgetedCents,
      currency: row.currency,
    })),
    displayCurrency,
    rates,
    options,
  );
  const spent = aggregateDisplayCurrencyAmounts(
    rows.map((row) => ({
      id: `${row.id}:spent`,
      amountCents: row.spentCents,
      currency: row.currency,
    })),
    displayCurrency,
    rates,
    options,
  );

  return {
    ...budgeted,
    totalCents: budgeted.totalCents - spent.totalCents,
    budgetedCents: budgeted.totalCents,
    spentCents: spent.totalCents,
    remainingCents: budgeted.totalCents - spent.totalCents,
    hasStaleRates: budgeted.hasStaleRates || spent.hasStaleRates,
    disclosure: budgeted.disclosure,
  };
}

export function calculateDashboardDisplayRollup(input: {
  readonly accountBalances: readonly DisplayCurrencyAmount[];
  readonly cashFlowTransactions: readonly DisplayCurrencyAmount[];
  readonly displayCurrency: string;
  readonly rates: readonly DisplayExchangeRate[];
  readonly options?: DisplayCurrencyRollupOptions;
}): DashboardDisplayRollup {
  return {
    netWorth: aggregateDisplayCurrencyAmounts(
      input.accountBalances,
      input.displayCurrency,
      input.rates,
      input.options,
    ),
    cashFlow: aggregateDisplayCurrencyAmounts(
      input.cashFlowTransactions,
      input.displayCurrency,
      input.rates,
      input.options,
    ),
  };
}

function buildDisclosure(
  displayCurrency: string,
  convertedCurrencyCodes: readonly string[],
  hasStaleRates: boolean,
  oldestRateTimestamp: string | null,
): string {
  if (convertedCurrencyCodes.length === 0) return `Shown in ${displayCurrency}.`;

  const staleCopy = hasStaleRates ? ' Some rates may be stale or offline.' : '';
  const timestampCopy = oldestRateTimestamp ? ` Oldest rate: ${oldestRateTimestamp}.` : '';
  return `Converted ${convertedCurrencyCodes.join(', ')} to ${displayCurrency}.${timestampCopy}${staleCopy}`;
}
