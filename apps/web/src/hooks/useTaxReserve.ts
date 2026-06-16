// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useMemo, useState } from 'react';
import type { Account, Transaction } from '../kmp/bridge';
import {
  DEFAULT_TAX_RESERVE_RATE,
  buildTaxReserveSummary,
  type TaxReserveSettings,
  type TaxReserveSummary,
} from '../lib/tax-reserve';

const STORAGE_KEY = 'finance.taxReserve.v1';

export interface UseTaxReserveInput {
  readonly currentMonthTransactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date'
  >[];
  readonly quarterTransactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date'
  >[];
  readonly accounts?: readonly Pick<Account, 'id' | 'purpose'>[];
  readonly asOf?: Date;
}

export interface UseTaxReserveResult {
  readonly settings: TaxReserveSettings;
  readonly summary: TaxReserveSummary;
  readonly updateRatePercent: (ratePercent: number) => void;
  readonly updateBucketBalanceCents: (bucketBalanceCents: number) => void;
  readonly addToBucket: (amountCents: number) => void;
}

function readStoredSettings(): TaxReserveSettings {
  if (typeof window === 'undefined') {
    return { rate: DEFAULT_TAX_RESERVE_RATE, bucketBalanceCents: 0 };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { rate: DEFAULT_TAX_RESERVE_RATE, bucketBalanceCents: 0 };
    }

    const parsed = JSON.parse(raw) as Partial<TaxReserveSettings>;
    return {
      rate: typeof parsed.rate === 'number' ? parsed.rate : DEFAULT_TAX_RESERVE_RATE,
      bucketBalanceCents:
        typeof parsed.bucketBalanceCents === 'number'
          ? Math.max(0, Math.round(parsed.bucketBalanceCents))
          : 0,
    };
  } catch {
    return { rate: DEFAULT_TAX_RESERVE_RATE, bucketBalanceCents: 0 };
  }
}

function persistSettings(settings: TaxReserveSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function sanitizeSettings(settings: TaxReserveSettings): TaxReserveSettings {
  return {
    rate: Number.isFinite(settings.rate)
      ? Math.min(Math.max(settings.rate, 0), 1)
      : DEFAULT_TAX_RESERVE_RATE,
    bucketBalanceCents: Math.max(0, Math.round(settings.bucketBalanceCents)),
  };
}

export function useTaxReserve({
  currentMonthTransactions,
  quarterTransactions,
  accounts = [],
  asOf,
}: UseTaxReserveInput): UseTaxReserveResult {
  const [settings, setSettings] = useState<TaxReserveSettings>(() =>
    sanitizeSettings(readStoredSettings()),
  );

  const updateSettings = useCallback(
    (updater: (current: TaxReserveSettings) => TaxReserveSettings) => {
      setSettings((current) => {
        const next = sanitizeSettings(updater(current));
        persistSettings(next);
        return next;
      });
    },
    [],
  );

  const updateRatePercent = useCallback(
    (ratePercent: number) => {
      updateSettings((current) => ({ ...current, rate: ratePercent / 100 }));
    },
    [updateSettings],
  );

  const updateBucketBalanceCents = useCallback(
    (bucketBalanceCents: number) => {
      updateSettings((current) => ({ ...current, bucketBalanceCents }));
    },
    [updateSettings],
  );

  const addToBucket = useCallback(
    (amountCents: number) => {
      updateSettings((current) => ({
        ...current,
        bucketBalanceCents: current.bucketBalanceCents + Math.max(0, Math.round(amountCents)),
      }));
    },
    [updateSettings],
  );

  const summary = useMemo(
    () =>
      buildTaxReserveSummary({
        currentMonthTransactions,
        quarterTransactions,
        accounts,
        settings,
        asOf,
      }),
    [accounts, asOf, currentMonthTransactions, quarterTransactions, settings],
  );

  return {
    settings,
    summary,
    updateRatePercent,
    updateBucketBalanceCents,
    addToBucket,
  };
}
