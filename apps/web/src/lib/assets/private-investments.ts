// SPDX-License-Identifier: BUSL-1.1

/**
 * Private-company and angel investment tracker.
 *
 * Tracks angel investments, venture fund commitments, capital calls,
 * distributions, MOIC, IRR, vintage year, and portfolio company status.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issue #1704
 */

import { safeDivide } from './crypto-portfolio';
import type {
  CapitalEvent,
  CompanyStatus,
  PrivateInvestment,
  PrivateInvestmentSummary,
} from './types';

// ---------------------------------------------------------------------------
// Capital events
// ---------------------------------------------------------------------------

/**
 * Compute total capital called for an investment.
 *
 * @param events - Capital events for the investment.
 * @returns Total capital called in cents.
 */
export function totalCapitalCalled(events: readonly CapitalEvent[]): number {
  return events.filter((e) => e.type === 'CALL').reduce((sum, e) => sum + e.amountCents, 0);
}

/**
 * Compute total distributions received from an investment.
 *
 * @param events - Capital events for the investment.
 * @returns Total distributions in cents.
 */
export function totalDistributions(events: readonly CapitalEvent[]): number {
  return events.filter((e) => e.type === 'DISTRIBUTION').reduce((sum, e) => sum + e.amountCents, 0);
}

// ---------------------------------------------------------------------------
// MOIC
// ---------------------------------------------------------------------------

/**
 * Compute Multiple on Invested Capital (MOIC) for an investment.
 *
 * MOIC = (Current Value + Distributions) / Invested Amount
 *
 * @param investment - The private investment.
 * @returns MOIC as a decimal (e.g. 2.5 = 2.5x). Returns 0 if invested is 0.
 */
export function computeMOIC(investment: PrivateInvestment): number {
  const distributions = totalDistributions(investment.capitalEvents);
  const totalReturn = investment.currentValueCents + distributions;
  const result = safeDivide(totalReturn, investment.investedAmountCents);
  return Math.round(result * 100) / 100;
}

// ---------------------------------------------------------------------------
// IRR (Newton's method approximation)
// ---------------------------------------------------------------------------

/**
 * Compute Internal Rate of Return (IRR) using Newton's method.
 *
 * Uses the invested amount as the initial outflow, capital events as
 * intermediate flows, and current value as the terminal value.
 *
 * @param investment - The private investment.
 * @param asOfDate - Valuation date for the terminal value (ISO-8601).
 * @returns IRR as a decimal percentage (e.g. 0.25 = 25%), or 0 if not computable.
 */
export function computeIRR(investment: PrivateInvestment, asOfDate: string): number {
  const baseDate = new Date(investment.investmentDate + 'T00:00:00Z');
  const endDate = new Date(asOfDate + 'T00:00:00Z');

  // Build cash flows: negative = outflow, positive = inflow
  interface CashFlow {
    amountCents: number;
    years: number;
  }

  const cashFlows: CashFlow[] = [];

  // Initial investment (outflow)
  cashFlows.push({ amountCents: -investment.investedAmountCents, years: 0 });

  // Capital events
  for (const event of investment.capitalEvents) {
    const eventDate = new Date(event.date + 'T00:00:00Z');
    const years = (eventDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    const amount = event.type === 'DISTRIBUTION' ? event.amountCents : -event.amountCents;
    cashFlows.push({ amountCents: amount, years });
  }

  // Terminal value (inflow)
  const terminalYears = (endDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (terminalYears <= 0) return 0;
  cashFlows.push({ amountCents: investment.currentValueCents, years: terminalYears });

  // Newton's method
  let rate = 0.1; // 10% initial guess
  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-7;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let npv = 0;
    let derivative = 0;

    for (const cf of cashFlows) {
      const discount = Math.pow(1 + rate, cf.years);
      if (discount === 0 || !Number.isFinite(discount)) return 0;
      npv += cf.amountCents / discount;
      derivative -= (cf.years * cf.amountCents) / (discount * (1 + rate));
    }

    if (Math.abs(derivative) < TOLERANCE) break;

    const newRate = rate - npv / derivative;
    if (Math.abs(newRate - rate) < TOLERANCE) {
      rate = newRate;
      break;
    }
    rate = newRate;

    // Guard against divergence
    if (!Number.isFinite(rate) || rate < -1) return 0;
  }

  return Math.round(rate * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// By vintage year
// ---------------------------------------------------------------------------

/**
 * Group investments by vintage year.
 *
 * @param investments - All private investments.
 * @returns Map of vintage year to investments.
 */
export function groupByVintageYear(
  investments: readonly PrivateInvestment[],
): ReadonlyMap<number, readonly PrivateInvestment[]> {
  const map = new Map<number, PrivateInvestment[]>();
  for (const inv of investments) {
    const existing = map.get(inv.vintageYear);
    if (existing) {
      existing.push(inv);
    } else {
      map.set(inv.vintageYear, [inv]);
    }
  }
  return map;
}

/**
 * Group investments by company status.
 *
 * @param investments - All private investments.
 * @returns Map of status to count.
 */
export function countByStatus(
  investments: readonly PrivateInvestment[],
): ReadonlyMap<CompanyStatus, number> {
  const map = new Map<CompanyStatus, number>();
  for (const inv of investments) {
    map.set(inv.status, (map.get(inv.status) ?? 0) + 1);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Portfolio summary
// ---------------------------------------------------------------------------

/**
 * Compute a summary of the full private investment portfolio.
 *
 * @param investments - All private investments.
 * @returns Private investment portfolio summary.
 */
export function computePrivateInvestmentSummary(
  investments: readonly PrivateInvestment[],
): PrivateInvestmentSummary {
  if (investments.length === 0) {
    return {
      totalInvestedCents: 0,
      totalCurrentValueCents: 0,
      totalDistributionsCents: 0,
      totalCapitalCalledCents: 0,
      moic: 0,
      irr: 0,
      activeCount: 0,
      byStatus: new Map(),
    };
  }

  let totalInvested = 0;
  let totalCurrentValue = 0;
  let totalDist = 0;
  let totalCalled = 0;
  let activeCount = 0;

  for (const inv of investments) {
    totalInvested += inv.investedAmountCents;
    totalCurrentValue += inv.currentValueCents;
    totalDist += totalDistributions(inv.capitalEvents);
    totalCalled += totalCapitalCalled(inv.capitalEvents);
    if (inv.status === 'ACTIVE') activeCount++;
  }

  const portfolioMoic =
    Math.round(safeDivide(totalCurrentValue + totalDist, totalInvested) * 100) / 100;

  return {
    totalInvestedCents: totalInvested,
    totalCurrentValueCents: totalCurrentValue,
    totalDistributionsCents: totalDist,
    totalCapitalCalledCents: totalCalled,
    moic: portfolioMoic,
    irr: 0, // Portfolio-level IRR requires aggregated cash flow, omitted for simplicity
    activeCount,
    byStatus: countByStatus(investments),
  };
}
