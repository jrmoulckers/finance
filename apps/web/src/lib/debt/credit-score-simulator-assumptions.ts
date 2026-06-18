// SPDX-License-Identifier: BUSL-1.1

import type { CreditCard } from '../debt-types';
import type { CreditScoreSimulationResult } from './credit-score-impact';

export interface CreditScoreAssumptionSummary {
  readonly knownFromApp: readonly string[];
  readonly assumptions: readonly string[];
  readonly missingStates: readonly string[];
  readonly qualitativeDisclaimer: string;
}

export function buildCreditScoreAssumptionSummary(
  cards: readonly CreditCard[],
  simulation: CreditScoreSimulationResult,
): CreditScoreAssumptionSummary {
  const knownFromApp = new Set<string>();
  const assumptions = new Set<string>();
  const missingStates: string[] = [];

  for (const impact of simulation.factorImpacts) {
    impact.knownInputs.forEach((input) => knownFromApp.add(input));
    impact.assumptions.forEach((assumption) => assumptions.add(assumption));
  }

  const missingLimitCards = cards.filter(
    (card) => !card.creditLimitCents || card.creditLimitCents <= 0,
  );
  if (missingLimitCards.length > 0) {
    missingStates.push(
      `${missingLimitCards.length} card${missingLimitCards.length === 1 ? '' : 's'} need credit limits before utilization can be modeled.`,
    );
  }
  if (!knownFromApp.has('planned on-time payment months')) {
    missingStates.push(
      'Payment-history direction needs a modeled on-time streak or imported late-payment history.',
    );
  }
  if (
    simulation.factorImpacts.some(
      (impact) => impact.factor === 'account_age_mix' && impact.direction === 'unknown',
    )
  ) {
    missingStates.push(
      'Closure scenarios need account age and bureau history that may be outside the app.',
    );
  }

  return {
    knownFromApp: [...knownFromApp],
    assumptions: [...assumptions],
    missingStates,
    qualitativeDisclaimer: simulation.disclaimer,
  };
}
