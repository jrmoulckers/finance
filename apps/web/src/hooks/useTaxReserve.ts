// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useMemo, useState } from 'react';
import type { Account, Transaction } from '../kmp/bridge';
import {
  DEFAULT_TAX_RESERVE_RATE,
  buildTaxReserveSummary,
  type EstimatedTaxPaymentRecord,
  type TaxReserveRateBreakdown,
  type TaxReserveSettings,
  type TaxReserveSummary,
} from '../lib/tax-reserve';

const STORAGE_KEY = 'finance.taxReserve.v1';
const PAYMENTS_STORAGE_KEY = 'finance.taxReserve.payments.v1';

export interface UseTaxReserveInput {
  readonly currentMonthTransactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date' | 'customFields'
  >[];
  readonly quarterTransactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date' | 'customFields'
  >[];
  readonly accounts?: readonly Pick<Account, 'id' | 'purpose'>[];
  readonly asOf?: Date;
}

export interface UseTaxReserveResult {
  readonly settings: TaxReserveSettings;
  readonly estimatedPayments: readonly EstimatedTaxPaymentRecord[];
  readonly summary: TaxReserveSummary;
  readonly updateRatePercent: (ratePercent: number) => void;
  readonly updateRateBreakdown: (breakdown: TaxReserveRateBreakdown) => void;
  readonly updateBucketBalanceCents: (bucketBalanceCents: number) => void;
  readonly addToBucket: (amountCents: number) => void;
  readonly recordEstimatedPayment: (payment: EstimatedTaxPaymentRecord) => void;
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

function readStoredPayments(): EstimatedTaxPaymentRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PAYMENTS_STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw) as EstimatedTaxPaymentRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistPayments(payments: readonly EstimatedTaxPaymentRecord[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(payments));
}

function sanitizeSettings(settings: TaxReserveSettings): TaxReserveSettings {
  return {
    rate: Number.isFinite(settings.rate)
      ? Math.min(Math.max(settings.rate, 0), 1)
      : DEFAULT_TAX_RESERVE_RATE,
    bucketBalanceCents: Math.max(0, Math.round(settings.bucketBalanceCents)),
    federalRate:
      settings.federalRate === undefined
        ? undefined
        : Math.min(Math.max(settings.federalRate, 0), 1),
    stateRate:
      settings.stateRate === undefined ? undefined : Math.min(Math.max(settings.stateRate, 0), 1),
    selfEmploymentRate:
      settings.selfEmploymentRate === undefined
        ? undefined
        : Math.min(Math.max(settings.selfEmploymentRate, 0), 1),
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
  const [estimatedPayments, setEstimatedPayments] = useState<EstimatedTaxPaymentRecord[]>(() =>
    readStoredPayments(),
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

  const updateRateBreakdown = useCallback(
    (breakdown: TaxReserveRateBreakdown) => {
      updateSettings((current) => ({
        ...current,
        federalRate: breakdown.federalRate,
        stateRate: breakdown.stateRate,
        selfEmploymentRate: breakdown.selfEmploymentRate,
        rate: breakdown.federalRate + breakdown.stateRate + breakdown.selfEmploymentRate,
      }));
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

  const recordEstimatedPayment = useCallback((payment: EstimatedTaxPaymentRecord) => {
    setEstimatedPayments((current) => {
      const next = [...current.filter((item) => item.id !== payment.id), payment];
      persistPayments(next);
      return next;
    });
  }, []);

  const summary = useMemo(
    () =>
      buildTaxReserveSummary({
        currentMonthTransactions,
        quarterTransactions,
        accounts,
        settings,
        estimatedPayments,
        asOf,
      }),
    [accounts, asOf, currentMonthTransactions, quarterTransactions, estimatedPayments, settings],
  );

  return {
    settings,
    estimatedPayments,
    summary,
    updateRatePercent,
    updateRateBreakdown,
    updateBucketBalanceCents,
    addToBucket,
    recordEstimatedPayment,
  };
}
