// SPDX-License-Identifier: BUSL-1.1

/**
 * Pay-yourself-first automatic allocation engine.
 *
 * Savings and priority goals are funded first in priority order,
 * then essentials, then discretionary spending gets whatever remains.
 *
 * All amounts are integer cents. Inputs are never mutated.
 *
 * References: #1561
 */

import type {
  PayYourselfFirstAllocation,
  PayYourselfFirstResult,
  PayYourselfFirstRule,
} from './advanced-types';
import { bankersRound } from './utils';

// ---------------------------------------------------------------------------
// Core allocation
// ---------------------------------------------------------------------------

/**
 * Allocate income using pay-yourself-first rules.
 *
 * Rules are funded in ascending priority order (lower priority number = funded first).
 * Each rule either takes a fixed amount or a percentage of the original income.
 * If remaining income is insufficient, the rule receives a partial allocation.
 *
 * @param incomeCents - Total income in cents (must be non-negative).
 * @param rules - Allocation rules sorted by priority (caller may pass unsorted; we sort internally).
 * @returns A {@link PayYourselfFirstResult} with allocations and remaining discretionary.
 */
export function allocatePayYourselfFirst(
  incomeCents: number,
  rules: readonly PayYourselfFirstRule[],
): PayYourselfFirstResult {
  if (incomeCents < 0) {
    return {
      incomeCents,
      allocations: [],
      discretionaryCents: 0,
      unfundedRules: [...rules],
    };
  }

  // Sort by priority ascending (lower = higher priority)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  let remaining = incomeCents;
  const allocations: PayYourselfFirstAllocation[] = [];
  const unfundedRules: PayYourselfFirstRule[] = [];

  for (const rule of sorted) {
    const requested = resolveRuleAmount(rule, incomeCents);
    const funded = Math.min(requested, remaining);

    allocations.push({
      ruleId: rule.id,
      targetName: rule.targetName,
      requestedCents: requested,
      fundedCents: funded,
      fullyFunded: funded >= requested,
    });

    if (funded < requested) {
      unfundedRules.push(rule);
    }

    remaining -= funded;
  }

  return {
    incomeCents,
    allocations,
    discretionaryCents: remaining,
    unfundedRules,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the cent amount for a rule.
 *
 * @param rule - The allocation rule.
 * @param incomeCents - Total income in cents.
 * @returns Resolved amount in cents.
 */
function resolveRuleAmount(rule: PayYourselfFirstRule, incomeCents: number): number {
  if (rule.allocationType === 'fixed') {
    return Math.max(0, rule.value);
  }

  // Percentage: value is in basis points (1% = 100 bps)
  if (incomeCents === 0) return 0;
  return bankersRound((incomeCents * rule.value) / 10_000);
}
