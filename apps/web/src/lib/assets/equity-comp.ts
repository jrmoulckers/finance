// SPDX-License-Identifier: BUSL-1.1

/**
 * Equity compensation tracker for RSUs, ISO/NSO options, and ESPP.
 *
 * Computes vesting schedules (cliff + periodic), total unvested/vested value,
 * vesting timelines, and tax implications (AMT for ISOs, ordinary income for
 * NSOs, ESPP discount income).
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1710, #1712
 */

import { bankersRound, safeDivide } from './crypto-portfolio';
import type {
  EquityCompSummary,
  EquityGrant,
  EquityGrantSummary,
  EquityTaxImplication,
  VestingEvent,
  VestingSchedule,
} from './types';

// ---------------------------------------------------------------------------
// Vesting schedule computation
// ---------------------------------------------------------------------------

/**
 * Add months to a Date (UTC), clamping to end-of-month.
 *
 * @param date - Base date.
 * @param months - Months to add.
 * @returns New Date with months added.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  // Clamp to end-of-month if day overflowed
  if (result.getUTCDate() !== day) {
    result.setUTCDate(0);
  }
  return result;
}

/** Format a Date as ISO-8601 local date string. */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Generate the full vesting event timeline for a vesting schedule.
 *
 * Supports cliff vesting followed by periodic (monthly, quarterly, or annual)
 * vesting for the remaining shares.
 *
 * @param schedule - The vesting schedule definition.
 * @returns Array of vesting events in chronological order.
 */
export function generateVestingTimeline(schedule: VestingSchedule): readonly VestingEvent[] {
  if (schedule.totalShares <= 0 || schedule.vestingMonths <= 0) return [];

  const events: VestingEvent[] = [];
  const startDate = new Date(schedule.vestingStartDate + 'T00:00:00Z');

  // Determine vesting period in months
  const periodMonths =
    schedule.frequency === 'MONTHLY' ? 1 : schedule.frequency === 'QUARTERLY' ? 3 : 12;

  // Compute number of vesting events after cliff
  const postCliffMonths = schedule.vestingMonths - schedule.cliffMonths;
  const postCliffEvents = Math.max(0, Math.floor(postCliffMonths / periodMonths));
  const totalEvents = postCliffEvents + (schedule.cliffMonths > 0 ? 1 : 0);

  if (totalEvents <= 0) return [];

  // Shares per event (evenly divided, remainder to last event)
  const sharesPerEvent = Math.floor(schedule.totalShares / totalEvents);
  let remainingShares = schedule.totalShares;
  let vestedCumulative = 0;
  let eventIndex = 0;

  // Cliff event
  if (schedule.cliffMonths > 0) {
    const cliffDate = addMonths(startDate, schedule.cliffMonths);
    const cliffShares = eventIndex === totalEvents - 1 ? remainingShares : sharesPerEvent;
    vestedCumulative += cliffShares;
    remainingShares -= cliffShares;
    events.push({
      date: formatDate(cliffDate),
      shares: cliffShares,
      vestedCumulativeShares: vestedCumulative,
      percentVested: Math.round(safeDivide(vestedCumulative, schedule.totalShares) * 10000) / 100,
    });
    eventIndex++;
  }

  // Post-cliff periodic events
  for (let i = 0; i < postCliffEvents; i++) {
    const monthsFromStart = schedule.cliffMonths + (i + 1) * periodMonths;
    const vestDate = addMonths(startDate, monthsFromStart);
    const isLast = eventIndex === totalEvents - 1;
    const shares = isLast ? remainingShares : sharesPerEvent;
    vestedCumulative += shares;
    remainingShares -= shares;
    events.push({
      date: formatDate(vestDate),
      shares,
      vestedCumulativeShares: vestedCumulative,
      percentVested: Math.round(safeDivide(vestedCumulative, schedule.totalShares) * 10000) / 100,
    });
    eventIndex++;
  }

  return events;
}

/**
 * Compute the number of shares vested as of a given date.
 *
 * @param schedule - The vesting schedule.
 * @param asOfDate - Date to check (ISO-8601 string).
 * @returns Number of shares vested.
 */
export function sharesVestedAsOf(schedule: VestingSchedule, asOfDate: string): number {
  const events = generateVestingTimeline(schedule);
  const asOf = new Date(asOfDate + 'T00:00:00Z').getTime();
  let vested = 0;
  for (const event of events) {
    if (new Date(event.date + 'T00:00:00Z').getTime() <= asOf) {
      vested = event.vestedCumulativeShares;
    }
  }
  return vested;
}

/**
 * Find the next vesting event after a given date.
 *
 * @param schedule - The vesting schedule.
 * @param afterDate - Date to search after (ISO-8601 string).
 * @returns The next vesting event, or undefined if fully vested.
 */
export function nextVestingEvent(
  schedule: VestingSchedule,
  afterDate: string,
): VestingEvent | undefined {
  const events = generateVestingTimeline(schedule);
  const after = new Date(afterDate + 'T00:00:00Z').getTime();
  return events.find((e) => new Date(e.date + 'T00:00:00Z').getTime() > after);
}

// ---------------------------------------------------------------------------
// Grant value computation
// ---------------------------------------------------------------------------

/**
 * Compute the spread (intrinsic value) per share for an option or ESPP grant.
 *
 * For RSUs, spread equals the full share price.
 * For options (ISO/NSO), spread = current price − strike price.
 * For ESPP, spread = current price − discounted purchase price.
 *
 * @param grant - The equity grant.
 * @returns Spread per share in cents (never negative).
 */
export function spreadPerShare(grant: EquityGrant): number {
  switch (grant.grantType) {
    case 'RSU':
      return grant.currentSharePriceCents;
    case 'ISO':
    case 'NSO':
      return Math.max(0, grant.currentSharePriceCents - (grant.strikePriceCents ?? 0));
    case 'ESPP': {
      const discount = grant.esppDiscountRate ?? 0;
      const purchasePrice = bankersRound(grant.currentSharePriceCents * (1 - discount));
      return Math.max(0, grant.currentSharePriceCents - purchasePrice);
    }
  }
}

/**
 * Compute a per-grant summary including vested/unvested values.
 *
 * @param grant - The equity grant.
 * @param asOfDate - Date to evaluate vesting (ISO-8601 string).
 * @returns Summary for this grant.
 */
export function computeGrantSummary(grant: EquityGrant, asOfDate: string): EquityGrantSummary {
  const vested = sharesVestedAsOf(grant.vestingSchedule, asOfDate);
  const unvested = grant.totalShares - vested;
  const spread = spreadPerShare(grant);
  const next = nextVestingEvent(grant.vestingSchedule, asOfDate);

  return {
    grantId: grant.id,
    grantType: grant.grantType,
    companyName: grant.companyName,
    vestedShares: vested,
    unvestedShares: unvested,
    vestedValueCents: bankersRound(vested * spread),
    unvestedValueCents: bankersRound(unvested * spread),
    spreadCents: spread,
    nextVestingDate: next?.date,
    nextVestingShares: next?.shares,
  };
}

// ---------------------------------------------------------------------------
// Tax implications
// ---------------------------------------------------------------------------

/**
 * Compute tax implications for exercising or selling equity.
 *
 * - RSU vesting: ordinary income at FMV on vest date
 * - ISO exercise: AMT adjustment = (FMV − strike) × shares
 * - NSO exercise: ordinary income = (FMV − strike) × shares
 * - ESPP sale: ordinary income on discount portion
 *
 * @param grant - The equity grant.
 * @param shares - Number of shares being exercised/sold.
 * @param salePriceCents - Sale price per share in cents (for capital gain calc).
 * @returns Tax implication details.
 */
export function computeTaxImplication(
  grant: EquityGrant,
  shares: number,
  salePriceCents?: number,
): EquityTaxImplication {
  const salePrice = salePriceCents ?? grant.currentSharePriceCents;

  switch (grant.grantType) {
    case 'RSU': {
      const ordinaryIncome = bankersRound(shares * grant.currentSharePriceCents);
      const capitalGain = salePriceCents
        ? bankersRound(shares * (salePrice - grant.currentSharePriceCents))
        : 0;
      return {
        grantType: 'RSU',
        ordinaryIncomeCents: ordinaryIncome,
        amtAdjustmentCents: 0,
        capitalGainCents: capitalGain,
        description: `RSU vesting: ${shares} shares taxed as ordinary income at $${(grant.currentSharePriceCents / 100).toFixed(2)}/share.`,
      };
    }
    case 'ISO': {
      const strike = grant.strikePriceCents ?? 0;
      const fmv = grant.fmvAtGrantCents ?? grant.currentSharePriceCents;
      const amtAdjustment = bankersRound(shares * (fmv - strike));
      const capitalGain = salePriceCents ? bankersRound(shares * (salePrice - strike)) : 0;
      return {
        grantType: 'ISO',
        ordinaryIncomeCents: 0,
        amtAdjustmentCents: Math.max(0, amtAdjustment),
        capitalGainCents: capitalGain,
        description: `ISO exercise: ${shares} shares. AMT adjustment of $${(Math.max(0, amtAdjustment) / 100).toFixed(2)}. No ordinary income at exercise if qualifying disposition.`,
      };
    }
    case 'NSO': {
      const strike = grant.strikePriceCents ?? 0;
      const spread = Math.max(0, grant.currentSharePriceCents - strike);
      const ordinaryIncome = bankersRound(shares * spread);
      const capitalGain = salePriceCents
        ? bankersRound(shares * (salePrice - grant.currentSharePriceCents))
        : 0;
      return {
        grantType: 'NSO',
        ordinaryIncomeCents: ordinaryIncome,
        amtAdjustmentCents: 0,
        capitalGainCents: capitalGain,
        description: `NSO exercise: ${shares} shares. Ordinary income of $${(ordinaryIncome / 100).toFixed(2)} on spread.`,
      };
    }
    case 'ESPP': {
      const discount = grant.esppDiscountRate ?? 0;
      const purchasePrice = bankersRound(grant.currentSharePriceCents * (1 - discount));
      const discountIncome = bankersRound(shares * (grant.currentSharePriceCents - purchasePrice));
      const capitalGain = salePriceCents
        ? bankersRound(shares * (salePrice - grant.currentSharePriceCents))
        : 0;
      return {
        grantType: 'ESPP',
        ordinaryIncomeCents: discountIncome,
        amtAdjustmentCents: 0,
        capitalGainCents: capitalGain,
        description: `ESPP purchase: ${shares} shares at ${(discount * 100).toFixed(0)}% discount. Ordinary income of $${(discountIncome / 100).toFixed(2)} on discount.`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Portfolio summary
// ---------------------------------------------------------------------------

/**
 * Compute a comprehensive equity compensation summary.
 *
 * @param grants - All equity grants.
 * @param asOfDate - Date to evaluate vesting (ISO-8601 string).
 * @returns Full equity compensation summary.
 */
export function computeEquityCompSummary(
  grants: readonly EquityGrant[],
  asOfDate: string,
): EquityCompSummary {
  if (grants.length === 0) {
    return {
      totalGrantedShares: 0,
      totalVestedShares: 0,
      totalUnvestedShares: 0,
      totalVestedValueCents: 0,
      totalUnvestedValueCents: 0,
      totalSpreadCents: 0,
      grants: [],
    };
  }

  const grantSummaries = grants.map((g) => computeGrantSummary(g, asOfDate));

  let totalGranted = 0;
  let totalVested = 0;
  let totalUnvested = 0;
  let totalVestedValue = 0;
  let totalUnvestedValue = 0;
  let totalSpread = 0;

  for (const gs of grantSummaries) {
    totalGranted += gs.vestedShares + gs.unvestedShares;
    totalVested += gs.vestedShares;
    totalUnvested += gs.unvestedShares;
    totalVestedValue += gs.vestedValueCents;
    totalUnvestedValue += gs.unvestedValueCents;
    totalSpread += gs.spreadCents;
  }

  return {
    totalGrantedShares: totalGranted,
    totalVestedShares: totalVested,
    totalUnvestedShares: totalUnvested,
    totalVestedValueCents: totalVestedValue,
    totalUnvestedValueCents: totalUnvestedValue,
    totalSpreadCents: totalSpread,
    grants: grantSummaries,
  };
}
