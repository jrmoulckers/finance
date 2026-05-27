// SPDX-License-Identifier: BUSL-1.1

import type { Transaction } from '../kmp/bridge';

export const BNPL_STACKING_THRESHOLD_STORAGE_KEY = 'finance:bnpl-stacking-threshold-cents';
export const DEFAULT_BNPL_STACKING_THRESHOLD_CENTS = 50_000;

export const BNPL_CUSTOM_FIELD_KEYS = {
  liabilityType: 'liabilityType',
  installmentCount: 'installmentCount',
  installmentStatus: 'installmentStatus',
} as const;

export function loadBnplStackingThresholdCents(): number {
  const stored = localStorage.getItem(BNPL_STACKING_THRESHOLD_STORAGE_KEY);
  const parsed = stored ? Number.parseInt(stored, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BNPL_STACKING_THRESHOLD_CENTS;
}

export function saveBnplStackingThresholdCents(thresholdCents: number): void {
  localStorage.setItem(BNPL_STACKING_THRESHOLD_STORAGE_KEY, String(Math.max(1, thresholdCents)));
}

export function isBnplLiabilityTransaction(transaction: Transaction): boolean {
  return (
    transaction.customFields?.[BNPL_CUSTOM_FIELD_KEYS.liabilityType] === 'BNPL' ||
    transaction.tags.includes('bnpl')
  );
}

export function isBnplInstallmentPaid(transaction: Transaction): boolean {
  return transaction.customFields?.[BNPL_CUSTOM_FIELD_KEYS.installmentStatus] === 'PAID';
}

export function bnplInstallmentCount(transaction: Transaction): number | null {
  const raw = transaction.customFields?.[BNPL_CUSTOM_FIELD_KEYS.installmentCount];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function bnplStackingAlert(
  transactions: readonly Transaction[],
  thresholdCents: number,
): string | null {
  const openBnplExposure = transactions
    .filter(
      (transaction) =>
        isBnplLiabilityTransaction(transaction) && !isBnplInstallmentPaid(transaction),
    )
    .reduce((total, transaction) => total + Math.abs(transaction.amount.amount), 0);

  if (openBnplExposure < thresholdCents) {
    return null;
  }

  return `BNPL stacking risk: ${openBnplExposure / 100} due or outstanding exceeds your configured ${thresholdCents / 100} threshold.`;
}
