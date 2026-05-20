// SPDX-License-Identifier: BUSL-1.1

/**
 * Anti-coercion safeguards for shared-finance permissions.
 *
 * Provides ADP-style masked views that show percentages, trends, and
 * colour-coded statuses instead of raw dollar amounts. Includes duress
 * detection (rapid permission changes), independent access verification,
 * and an immutable audit trail.
 *
 * All functions are pure — no side effects.
 *
 * References: issue #1727
 */

import type {
  CoercionSafeguard,
  HealthStatus,
  HouseholdId,
  ISODateString,
  MaskedView,
  PermissionChangeEntry,
  TrendDirection,
  UserId,
} from './types';

// ---------------------------------------------------------------------------
// Masked View Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a trend direction by comparing a current value with a previous one.
 *
 * @param currentCents - Current value in cents.
 * @param previousCents - Previous value in cents.
 * @returns The trend direction.
 */
export function deriveTrend(currentCents: number, previousCents: number): TrendDirection {
  if (currentCents > previousCents) return 'up';
  if (currentCents < previousCents) return 'down';
  return 'stable';
}

/**
 * Derive a colour-coded health status from a percentage of a target.
 *
 * - ≥ 80% of target → healthy
 * - 50–79% → caution
 * - < 50% → at_risk
 *
 * @param actualCents - Actual value in cents.
 * @param targetCents - Target value in cents.
 * @returns Health status category.
 */
export function deriveHealthStatus(actualCents: number, targetCents: number): HealthStatus {
  if (targetCents <= 0) return 'healthy';
  const ratio = actualCents / targetCents;
  if (ratio >= 0.8) return 'healthy';
  if (ratio >= 0.5) return 'caution';
  return 'at_risk';
}

/**
 * Compute the percentage a value represents of a total, using banker's rounding.
 *
 * @param partCents - The part value in cents.
 * @param totalCents - The total value in cents.
 * @returns Percentage (0–100), rounded to two decimal places.
 */
export function computePercentage(partCents: number, totalCents: number): number {
  if (totalCents === 0) return 0;
  const raw = (partCents / totalCents) * 100;
  return bankersRound(raw, 2);
}

/**
 * Build a masked view for a single financial metric.
 *
 * The resulting view contains no raw dollar amounts — only percentages,
 * trend indicators, and colour-coded statuses.
 *
 * @param label - Human-readable metric label.
 * @param currentCents - Current value in cents.
 * @param previousCents - Previous-period value in cents (for trend).
 * @param totalCents - Total across all categories (for percentage).
 * @param targetCents - Target/budget value in cents (for health status).
 * @returns A {@link MaskedView} safe for display in coercion-risk scenarios.
 */
export function buildMaskedView(
  label: string,
  currentCents: number,
  previousCents: number,
  totalCents: number,
  targetCents: number,
): MaskedView {
  return {
    label,
    percentage: computePercentage(currentCents, totalCents),
    trend: deriveTrend(currentCents, previousCents),
    status: deriveHealthStatus(currentCents, targetCents),
  };
}

/**
 * Build masked views for a collection of financial categories.
 *
 * @param items - Array of category data.
 * @param totalCents - Grand total used for percentage calculation.
 * @returns Array of {@link MaskedView} objects.
 */
export function buildMaskedViews(
  items: readonly {
    label: string;
    currentCents: number;
    previousCents: number;
    targetCents: number;
  }[],
  totalCents: number,
): MaskedView[] {
  return items.map((item) =>
    buildMaskedView(
      item.label,
      item.currentCents,
      item.previousCents,
      totalCents,
      item.targetCents,
    ),
  );
}

// ---------------------------------------------------------------------------
// Duress / Rapid-Change Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether an unusually rapid sequence of permission changes has occurred.
 *
 * @param entries - Permission change audit log.
 * @param safeguard - Current safeguard configuration.
 * @param now - Current ISO timestamp.
 * @returns `true` if the number of changes within the detection window exceeds the threshold.
 */
export function detectRapidChanges(
  entries: readonly PermissionChangeEntry[],
  safeguard: CoercionSafeguard,
  now: ISODateString,
): boolean {
  const windowStart = new Date(now).getTime() - safeguard.rapidChangeWindowMs;
  const recentCount = entries.filter(
    (e) =>
      e.householdId === safeguard.householdId && new Date(e.timestamp).getTime() >= windowStart,
  ).length;
  return recentCount >= safeguard.rapidChangeThreshold;
}

/**
 * Flag a permission-change entry as suspicious.
 *
 * @param entry - The entry to flag.
 * @returns A new entry with `flaggedAsSuspicious` set to `true`.
 */
export function flagAsSuspicious(entry: PermissionChangeEntry): PermissionChangeEntry {
  return { ...entry, flaggedAsSuspicious: true };
}

// ---------------------------------------------------------------------------
// Safe Mode
// ---------------------------------------------------------------------------

/**
 * Create a default coercion safeguard configuration.
 *
 * @param householdId - Target household.
 * @returns Default {@link CoercionSafeguard}.
 */
export function createDefaultSafeguard(householdId: HouseholdId): CoercionSafeguard {
  return {
    householdId,
    safeModeActive: false,
    rapidChangeThreshold: 5,
    rapidChangeWindowMs: 60_000, // 1 minute
    independentAccessEnabled: false,
  };
}

/**
 * Activate safe mode (masked views on, raw numbers hidden).
 *
 * @param safeguard - Current configuration.
 * @returns Updated safeguard with `safeModeActive` set to `true`.
 */
export function activateSafeMode(safeguard: CoercionSafeguard): CoercionSafeguard {
  return { ...safeguard, safeModeActive: true };
}

/**
 * Deactivate safe mode.
 *
 * @param safeguard - Current configuration.
 * @returns Updated safeguard with `safeModeActive` set to `false`.
 */
export function deactivateSafeMode(safeguard: CoercionSafeguard): CoercionSafeguard {
  return { ...safeguard, safeModeActive: false };
}

/**
 * Enable independent access verification (PIN/passphrase).
 *
 * @param safeguard - Current configuration.
 * @returns Updated safeguard.
 */
export function enableIndependentAccess(safeguard: CoercionSafeguard): CoercionSafeguard {
  return { ...safeguard, independentAccessEnabled: true };
}

// ---------------------------------------------------------------------------
// Audit Trail
// ---------------------------------------------------------------------------

/**
 * Create an immutable audit entry for a permission change.
 *
 * @param id - Unique entry identifier.
 * @param householdId - Household context.
 * @param changedBy - User who made the change.
 * @param targetUser - User whose permissions were changed.
 * @param changeType - Type of change (e.g. "role_change").
 * @param previousValue - Value before the change.
 * @param newValue - Value after the change.
 * @param now - Current ISO timestamp.
 * @returns A new {@link PermissionChangeEntry}.
 */
export function createPermissionChangeEntry(
  id: string,
  householdId: HouseholdId,
  changedBy: UserId,
  targetUser: UserId,
  changeType: string,
  previousValue: string,
  newValue: string,
  now: ISODateString,
): PermissionChangeEntry {
  return {
    id,
    householdId,
    changedBy,
    targetUser,
    changeType,
    previousValue,
    newValue,
    timestamp: now,
    flaggedAsSuspicious: false,
  };
}

/**
 * Filter the audit trail for a specific user.
 *
 * @param entries - Full audit log.
 * @param userId - Target user (as the changed *or* changer).
 * @returns Filtered entries involving the given user.
 */
export function getEntriesForUser(
  entries: readonly PermissionChangeEntry[],
  userId: UserId,
): PermissionChangeEntry[] {
  return entries.filter((e) => e.changedBy === userId || e.targetUser === userId);
}

/**
 * Return only suspicious entries from the audit trail.
 *
 * @param entries - Full audit log.
 * @returns Entries where `flaggedAsSuspicious` is `true`.
 */
export function getSuspiciousEntries(
  entries: readonly PermissionChangeEntry[],
): PermissionChangeEntry[] {
  return entries.filter((e) => e.flaggedAsSuspicious);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even) to the given number of decimal places.
 *
 * @param value - The number to round.
 * @param decimals - Number of decimal places.
 * @returns Rounded value.
 */
function bankersRound(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  const shifted = value * factor;
  const floored = Math.floor(shifted);
  const diff = shifted - floored;

  if (Math.abs(diff - 0.5) < 1e-9) {
    // Round to even
    return (floored % 2 === 0 ? floored : floored + 1) / factor;
  }
  return Math.round(shifted) / factor;
}
