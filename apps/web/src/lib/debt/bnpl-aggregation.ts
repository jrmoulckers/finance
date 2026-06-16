// SPDX-License-Identifier: BUSL-1.1

/**
 * BNPL dashboard aggregation helpers.
 *
 * Wraps the existing BNPL engine with beta-entry-friendly normalization,
 * active/completed separation, due-date sorting, and collision thresholding.
 *
 * References: issue #2224
 */

import type { BnplAlert, BnplObligation, BnplRiskScore, BnplSummary } from '../debt-types';
import {
  calculateBnplRiskScore,
  calculateBnplSummary,
  detectPaymentCollisions,
} from '../debt-bnpl-engine';

export interface BnplInstallmentDue {
  readonly obligationId: string;
  readonly merchantName: string;
  readonly dueDate: string;
  readonly amountCents: number;
}

export interface BnplDashboardAggregationInput {
  readonly obligations: readonly BnplObligation[];
  readonly monthlyIncomeCents: number;
  readonly collisionThresholdCents?: number;
  readonly todayIso?: string;
}

export interface BnplDashboardAggregation {
  readonly activeObligations: BnplObligation[];
  readonly completedObligations: BnplObligation[];
  readonly upcomingInstallments: BnplInstallmentDue[];
  readonly summary: BnplSummary;
  readonly alerts: BnplAlert[];
  readonly riskScore: BnplRiskScore;
  readonly assumptions: string[];
}

function isActiveObligation(obligation: BnplObligation): boolean {
  return (
    obligation.remainingBalanceCents > 0 &&
    obligation.paidInstallments < obligation.totalInstallments &&
    obligation.upcomingDueDates.length > 0
  );
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
}

function filterDueDates(
  upcomingDueDates: readonly string[],
  todayIso: string | undefined,
): string[] {
  if (!todayIso) return [...upcomingDueDates];
  return upcomingDueDates.filter((dueDate) => compareIsoDates(dueDate, todayIso) >= 0);
}

export function aggregateBnplDashboard(
  input: BnplDashboardAggregationInput,
): BnplDashboardAggregation {
  const activeObligations = input.obligations
    .filter(isActiveObligation)
    .map((obligation) => ({
      ...obligation,
      upcomingDueDates: filterDueDates(obligation.upcomingDueDates, input.todayIso),
    }))
    .filter((obligation) => obligation.upcomingDueDates.length > 0);
  const activeIds = new Set(activeObligations.map((obligation) => obligation.id));
  const completedObligations = input.obligations.filter(
    (obligation) => !activeIds.has(obligation.id),
  );
  const upcomingInstallments = activeObligations
    .flatMap((obligation) =>
      obligation.upcomingDueDates.map((dueDate) => ({
        obligationId: obligation.id,
        merchantName: obligation.merchantName,
        dueDate,
        amountCents: obligation.installmentAmountCents,
      })),
    )
    .sort((left, right) => {
      const dateCompare = compareIsoDates(left.dueDate, right.dueDate);
      if (dateCompare !== 0) return dateCompare;
      return right.amountCents - left.amountCents;
    });

  return {
    activeObligations,
    completedObligations,
    upcomingInstallments,
    summary: calculateBnplSummary(activeObligations),
    alerts: detectPaymentCollisions(
      activeObligations,
      Math.max(0, input.collisionThresholdCents ?? 0),
    ),
    riskScore: calculateBnplRiskScore(activeObligations, Math.max(0, input.monthlyIncomeCents)),
    assumptions: [
      'Only obligations with remaining balances and future due dates are included in active exposure.',
      'Monthly commitment uses one installment per active obligation, matching the existing BNPL engine.',
    ],
  };
}

export interface BnplObligationDraft {
  readonly id: string;
  readonly merchantName: string;
  readonly originalAmountCents: number;
  readonly totalInstallments: number;
  readonly paidInstallments?: number;
  readonly installmentAmountCents: number;
  readonly annualRateBps?: number;
  readonly totalFeesCents?: number;
  readonly firstDueDateIso: string;
  readonly cadenceDays?: number;
}

function addDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function createBnplObligationFromDraft(draft: BnplObligationDraft): BnplObligation {
  const totalInstallments = Math.max(1, draft.totalInstallments);
  const paidInstallments = Math.max(0, Math.min(totalInstallments, draft.paidInstallments ?? 0));
  const remainingInstallments = totalInstallments - paidInstallments;
  const cadenceDays = Math.max(1, draft.cadenceDays ?? 14);
  const upcomingDueDates = Array.from({ length: remainingInstallments }, (_, index) =>
    addDaysIso(draft.firstDueDateIso, index * cadenceDays),
  );
  const remainingBalanceCents = Math.max(
    0,
    remainingInstallments * Math.max(0, draft.installmentAmountCents),
  );

  return {
    id: draft.id,
    merchantName: draft.merchantName.trim() || 'BNPL purchase',
    originalAmountCents: Math.max(0, draft.originalAmountCents),
    remainingBalanceCents,
    totalInstallments,
    paidInstallments,
    installmentAmountCents: Math.max(0, draft.installmentAmountCents),
    annualRateBps: Math.max(0, draft.annualRateBps ?? 0),
    totalFeesCents: Math.max(0, draft.totalFeesCents ?? 0),
    upcomingDueDates,
  };
}

export function markNextBnplInstallmentPaid(obligation: BnplObligation): BnplObligation {
  const nextPaidInstallments = Math.min(
    obligation.totalInstallments,
    obligation.paidInstallments + 1,
  );
  const nextDueDates = obligation.upcomingDueDates.slice(1);
  return {
    ...obligation,
    paidInstallments: nextPaidInstallments,
    remainingBalanceCents: Math.max(
      0,
      obligation.remainingBalanceCents - obligation.installmentAmountCents,
    ),
    upcomingDueDates: nextDueDates,
  };
}
