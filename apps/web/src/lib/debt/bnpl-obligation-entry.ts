// SPDX-License-Identifier: BUSL-1.1

import type { BnplObligation } from '../debt-types';
import { createBnplObligationFromDraft, type BnplObligationDraft } from './bnpl-aggregation';

export interface BnplEntryValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateBnplObligationDraft(draft: BnplObligationDraft): BnplEntryValidationResult {
  const errors: string[] = [];
  if (!draft.merchantName.trim()) errors.push('Merchant is required.');
  if (!isValidIsoDate(draft.firstDueDateIso)) errors.push('Enter a valid first due date.');
  if (draft.totalInstallments <= 0) errors.push('Total installments must be greater than zero.');
  if ((draft.paidInstallments ?? 0) > draft.totalInstallments) {
    errors.push('Paid installments cannot exceed total installments.');
  }
  if (draft.installmentAmountCents <= 0) errors.push('Installment amount must be greater than zero.');
  if (draft.originalAmountCents < (draft.paidInstallments ?? 0) * draft.installmentAmountCents) {
    errors.push('Paid schedule cannot exceed the original purchase amount.');
  }
  return { isValid: errors.length === 0, errors };
}

export function upsertBnplObligationFromDraft(
  current: readonly BnplObligation[],
  draft: BnplObligationDraft,
): readonly BnplObligation[] {
  const validation = validateBnplObligationDraft(draft);
  if (!validation.isValid) return current;

  const existing = current.find((obligation) => obligation.id === draft.id);
  const next = createBnplObligationFromDraft(draft);
  const obligation = existing
    ? {
        ...next,
        upcomingDueDates:
          existing.upcomingDueDates.length === next.upcomingDueDates.length
            ? existing.upcomingDueDates
            : next.upcomingDueDates,
      }
    : next;

  return existing
    ? current.map((item) => (item.id === obligation.id ? obligation : item))
    : [...current, obligation];
}
