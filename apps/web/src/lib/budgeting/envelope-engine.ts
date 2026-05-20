// SPDX-License-Identifier: BUSL-1.1

/**
 * Envelope budgeting calculation engine.
 *
 * Implements fund allocation to named envelopes, move-money workflow
 * between envelopes, and available-to-budget tracking.
 *
 * All amounts are integer cents. Inputs are never mutated.
 *
 * References: #1559
 */

import type {
  Envelope,
  EnvelopeBudgetSummary,
  EnvelopeDetail,
  MoveMoneyRequest,
  MoveMoneyResult,
} from './advanced-types';

// ---------------------------------------------------------------------------
// Summary calculation
// ---------------------------------------------------------------------------

/**
 * Calculate a full envelope budget summary.
 *
 * @param totalIncomeCents - Total income for the period in cents.
 * @param envelopes - Array of envelopes with budget/spend/carryover data.
 * @returns An {@link EnvelopeBudgetSummary} with per-envelope available balances.
 */
export function calculateEnvelopeSummary(
  totalIncomeCents: number,
  envelopes: readonly Envelope[],
): EnvelopeBudgetSummary {
  const details: EnvelopeDetail[] = envelopes.map((e) => ({
    id: e.id,
    name: e.name,
    budgetedCents: e.budgetedCents,
    spentCents: e.spentCents,
    carryoverCents: e.carryoverCents,
    availableCents: e.budgetedCents + e.carryoverCents - e.spentCents,
  }));

  const totalBudgetedCents = envelopes.reduce((sum, e) => sum + e.budgetedCents, 0);

  return {
    totalIncomeCents,
    totalBudgetedCents,
    availableToBudgetCents: totalIncomeCents - totalBudgetedCents,
    envelopes: details,
  };
}

// ---------------------------------------------------------------------------
// Move money
// ---------------------------------------------------------------------------

/**
 * Move money between two envelopes.
 *
 * The move adjusts the `budgetedCents` of the source and destination
 * envelopes. It fails if the source doesn't have enough budgeted funds
 * or if the amount is non-positive.
 *
 * @param envelopes - Current envelope state (not mutated).
 * @param request - The move-money request.
 * @returns A {@link MoveMoneyResult} with updated envelopes or an error.
 */
export function moveMoney(
  envelopes: readonly Envelope[],
  request: MoveMoneyRequest,
): MoveMoneyResult {
  const { fromEnvelopeId, toEnvelopeId, amountCents } = request;

  if (amountCents <= 0) {
    return { success: false, error: 'Amount must be positive.', envelopes: [...envelopes] };
  }

  if (fromEnvelopeId === toEnvelopeId) {
    return {
      success: false,
      error: 'Source and destination must be different.',
      envelopes: [...envelopes],
    };
  }

  const fromEnvelope = envelopes.find((e) => e.id === fromEnvelopeId);
  const toEnvelope = envelopes.find((e) => e.id === toEnvelopeId);

  if (!fromEnvelope) {
    return { success: false, error: 'Source envelope not found.', envelopes: [...envelopes] };
  }
  if (!toEnvelope) {
    return {
      success: false,
      error: 'Destination envelope not found.',
      envelopes: [...envelopes],
    };
  }

  const sourceAvailable =
    fromEnvelope.budgetedCents + fromEnvelope.carryoverCents - fromEnvelope.spentCents;
  if (amountCents > sourceAvailable) {
    return {
      success: false,
      error: 'Insufficient funds in source envelope.',
      envelopes: [...envelopes],
    };
  }

  const updated = envelopes.map((e) => {
    if (e.id === fromEnvelopeId) {
      return { ...e, budgetedCents: e.budgetedCents - amountCents };
    }
    if (e.id === toEnvelopeId) {
      return { ...e, budgetedCents: e.budgetedCents + amountCents };
    }
    return e;
  });

  return { success: true, envelopes: updated };
}

// ---------------------------------------------------------------------------
// Available balance for a single envelope
// ---------------------------------------------------------------------------

/**
 * Calculate the available balance for a single envelope.
 *
 * @param envelope - The envelope to inspect.
 * @returns Available balance in cents (budgeted + carryover − spent).
 */
export function envelopeAvailable(envelope: Envelope): number {
  return envelope.budgetedCents + envelope.carryoverCents - envelope.spentCents;
}
