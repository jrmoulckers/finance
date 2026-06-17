// SPDX-License-Identifier: BUSL-1.1

import type { CreditCard } from '../debt-types';
import {
  calculatePaymentToReachUtilization,
  simulateCreditScoreImpact,
  type CreditScoreSimulationResult,
} from './credit-score-impact';

export interface CreditScoreSimulatorDraft {
  readonly targetCardId: string;
  readonly targetUtilizationPercent: number;
  readonly plannedPaymentCents: number;
  readonly onTimePaymentMonths: number;
  readonly hardInquiries: number;
  readonly closeAccountIds: readonly string[];
}

export interface CreditScoreSimulatorPanelModel {
  readonly result: CreditScoreSimulationResult;
  readonly targetPaymentCents: number | null;
  readonly modeledPaymentCents: number;
}

export function buildCreditScoreSimulatorPanelModel(
  cards: readonly CreditCard[],
  draft: CreditScoreSimulatorDraft,
): CreditScoreSimulatorPanelModel {
  const targetCard = cards.find((card) => card.id === draft.targetCardId) ?? cards[0] ?? null;
  const targetPaymentCents = targetCard
    ? calculatePaymentToReachUtilization(targetCard, draft.targetUtilizationPercent)
    : null;
  const modeledPaymentCents = Math.max(0, draft.plannedPaymentCents, targetPaymentCents ?? 0);
  const plannedPaymentsCents = targetCard ? { [targetCard.id]: modeledPaymentCents } : {};
  const result = simulateCreditScoreImpact({
    cards,
    plannedPaymentsCents,
    targetUtilization: targetCard
      ? {
          cardId: targetCard.id,
          targetPercent: draft.targetUtilizationPercent,
        }
      : undefined,
    onTimePaymentMonths: draft.onTimePaymentMonths,
    newHardInquiries: draft.hardInquiries,
    closeAccountIds: draft.closeAccountIds,
  });

  return { result, targetPaymentCents, modeledPaymentCents };
}
