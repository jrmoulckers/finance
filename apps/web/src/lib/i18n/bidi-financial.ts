// SPDX-License-Identifier: BUSL-1.1

import { bidiIsolate, joinBidiIsolated } from './rtl';

export interface BidiFinancialParts {
  readonly amount: string | number;
  readonly currencyCode: string;
  readonly accountName?: string | null;
}

const ISO_CURRENCY_PATTERN = /\b[A-Z]{3}\b/g;
const FINANCIAL_NUMBER_PATTERN = /(?<![\p{L}\p{N}])[-+]?\p{Sc}?\d[\d,]*(?:\.\d+)?%?/gu;

export function isolateCurrencyCode(currencyCode: string): string {
  return bidiIsolate(currencyCode.trim().toUpperCase());
}

export function formatBidiFinancialSummary(parts: BidiFinancialParts): string {
  const tokens: Array<string | number> = [parts.currencyCode.trim().toUpperCase(), parts.amount];
  if (parts.accountName) tokens.push(parts.accountName);
  return joinBidiIsolated(tokens);
}

export function isolateFinancialTokens(text: string): string {
  return text
    .replace(ISO_CURRENCY_PATTERN, (currencyCode) => isolateCurrencyCode(currencyCode))
    .replace(FINANCIAL_NUMBER_PATTERN, (amount) => bidiIsolate(amount));
}
