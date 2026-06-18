// SPDX-License-Identifier: BUSL-1.1

import type { BnplObligation } from '../debt-types';
import { aggregateBnplDashboard, markNextBnplInstallmentPaid } from './bnpl-aggregation';

export const BNPL_OBLIGATION_STORAGE_KEY = 'finance.debt.bnplObligations.v1';

export interface PersistedBnplObligations {
  readonly version: 1;
  readonly obligations: readonly BnplObligation[];
}

export interface BnplStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isBnplObligation(value: unknown): value is BnplObligation {
  if (!value || typeof value !== 'object') return false;
  const obligation = value as Partial<BnplObligation>;
  return (
    typeof obligation.id === 'string' &&
    typeof obligation.merchantName === 'string' &&
    typeof obligation.remainingBalanceCents === 'number' &&
    typeof obligation.totalInstallments === 'number' &&
    typeof obligation.paidInstallments === 'number' &&
    Array.isArray(obligation.upcomingDueDates)
  );
}

export function readBnplObligations(storage: BnplStorageLike): readonly BnplObligation[] {
  const raw = storage.getItem(BNPL_OBLIGATION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as PersistedBnplObligations).version !== 1
    ) {
      return [];
    }
    const obligations = (parsed as PersistedBnplObligations).obligations;
    return Array.isArray(obligations) ? obligations.filter(isBnplObligation) : [];
  } catch {
    return [];
  }
}

export function writeBnplObligations(
  storage: BnplStorageLike,
  obligations: readonly BnplObligation[],
): void {
  storage.setItem(BNPL_OBLIGATION_STORAGE_KEY, JSON.stringify({ version: 1, obligations }));
}

export function markBnplInstallmentPaidById(
  obligations: readonly BnplObligation[],
  obligationId: string,
): readonly BnplObligation[] {
  return obligations.map((obligation) =>
    obligation.id === obligationId ? markNextBnplInstallmentPaid(obligation) : obligation,
  );
}

export function splitPersistedBnplLifecycle(
  obligations: readonly BnplObligation[],
  monthlyIncomeCents: number,
): { readonly active: readonly BnplObligation[]; readonly completed: readonly BnplObligation[] } {
  const aggregation = aggregateBnplDashboard({ obligations, monthlyIncomeCents });
  return {
    active: aggregation.activeObligations,
    completed: aggregation.completedObligations,
  };
}
