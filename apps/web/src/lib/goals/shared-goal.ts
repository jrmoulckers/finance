// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared goal contribution engine for couples saving together (e.g. a house
 * down payment).
 *
 * The engine models a goal funded by multiple named contributors and computes:
 *  - household total progress (sum of contributions vs the target);
 *  - per-contributor progress and relative effort;
 *  - suggested monthly contribution per person (even or income-weighted) that
 *    sums *exactly* to the household monthly target — no lost or created cents;
 *  - milestone sub-targets (down payment / closing costs / emergency buffer)
 *    as ordered checkpoints funded waterfall-style from the household total;
 *  - a privacy mode: `detailed` (each partner's exact amounts) vs `summarized`
 *    (household total + relative effort only, never exact partner amounts).
 *
 * Every monetary value is an integer number of cents — floating-point money is
 * never used. All functions are pure and side-effect free so they can be unit
 * tested deterministically.
 *
 * References: issue #2147 (web slice)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Visibility of per-partner contribution amounts.
 *
 * - `detailed`   — show each partner's exact contributed cents.
 * - `summarized` — show only the household total plus each partner's relative
 *   effort (share of the pot + a text label). Never exposes exact amounts.
 */
export type GoalContributionPrivacy = 'detailed' | 'summarized';

/** A named person contributing toward a shared goal. */
export interface GoalContributor {
  /** Stable identifier (unique within the goal). */
  readonly id: string;
  /** Display name shown in the UI. */
  readonly name: string;
  /** Total contributed so far, in integer cents (never negative). */
  readonly contributedCents: number;
  /**
   * Optional take-home monthly income in integer cents, used only for the
   * income-weighted split of suggested monthly contributions.
   */
  readonly monthlyIncomeCents?: number | null;
}

/** An ordered checkpoint within a goal (e.g. "Down payment"). */
export interface GoalMilestone {
  /** Stable identifier (unique within the goal). */
  readonly id: string;
  /** Human-readable label, e.g. "Closing costs". */
  readonly label: string;
  /** The cost of reaching this checkpoint, in integer cents (never negative). */
  readonly amountCents: number;
}

/** A contributor's relative standing versus an even split. */
export type RelativeEffort = 'leading' | 'on-track' | 'catching-up';

/** Computed progress for a single contributor. */
export interface ContributorProgress {
  readonly id: string;
  readonly name: string;
  /** Exact contributed cents, or `null` when privacy is `summarized`. */
  readonly contributedCents: number | null;
  /** Share of the household pot in basis points (0–10000); shares sum to 10000. */
  readonly shareBps: number;
  /** Share of the household pot as a percentage (0–100, one decimal place). */
  readonly sharePercent: number;
  /** Relative standing versus an even split, conveyed by text (never colour). */
  readonly relativeEffort: RelativeEffort;
}

/** Computed progress for a single milestone checkpoint. */
export interface MilestoneProgress {
  readonly id: string;
  readonly label: string;
  readonly amountCents: number;
  /** Household funds allocated to this checkpoint (waterfall order). */
  readonly fundedCents: number;
  /** Cents still required to complete this checkpoint. */
  readonly remainingCents: number;
  /** Completion of this checkpoint as an integer percentage (0–100). */
  readonly percentComplete: number;
  readonly status: 'complete' | 'in-progress' | 'upcoming';
}

/** A suggested monthly contribution for one person. */
export interface SuggestedMonthlyContribution {
  readonly id: string;
  readonly name: string;
  /** Suggested monthly amount in integer cents. */
  readonly monthlyCents: number;
}

/** Aggregate result describing a shared goal's contribution picture. */
export interface SharedGoalSummary {
  readonly targetCents: number;
  /** Sum of every contributor's contributed cents. */
  readonly contributedCents: number;
  /** Cents still required to reach the target (never negative). */
  readonly remainingCents: number;
  /** Household completion as an integer percentage (0–100, capped at 100). */
  readonly householdPercentComplete: number;
  readonly contributors: readonly ContributorProgress[];
  readonly milestones: readonly MilestoneProgress[];
  readonly privacy: GoalContributionPrivacy;
}

// ---------------------------------------------------------------------------
// Integer helpers
// ---------------------------------------------------------------------------

/** Coerce any value to a non-negative safe integer number of cents. */
function toNonNegativeCents(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

/**
 * Split `totalCents` evenly across `count` buckets so the parts sum *exactly*
 * to `totalCents`. The first `remainder` buckets each receive one extra cent.
 *
 * @returns An array of `count` integers summing to `totalCents`.
 */
export function allocateEven(totalCents: number, count: number): number[] {
  const total = toNonNegativeCents(totalCents);
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Allocate `totalCents` across buckets in proportion to `weights` using the
 * largest-remainder (Hamilton) method. The returned integers sum *exactly* to
 * `totalCents` — never losing or creating a cent. Non-positive/invalid weights
 * are treated as zero; if every weight is zero the split falls back to even.
 *
 * @returns An array the same length as `weights` summing to `totalCents`.
 */
export function allocateProportionally(totalCents: number, weights: readonly number[]): number[] {
  const count = weights.length;
  if (count === 0) {
    return [];
  }

  const total = toNonNegativeCents(totalCents);
  const safeWeights = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    return allocateEven(total, count);
  }

  const exact = safeWeights.map((weight) => (total * weight) / weightSum);
  const result = exact.map((value) => Math.floor(value));
  const allocated = result.reduce((sum, value) => sum + value, 0);
  let remainder = total - allocated;

  // Distribute the leftover cents to the largest fractional parts first,
  // breaking ties by lowest index for deterministic output.
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    const target = order[cursor % order.length];
    result[target.index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Aggregate calculations
// ---------------------------------------------------------------------------

/** Sum the contributed cents across all contributors (integer cents). */
export function totalContributedCents(contributors: readonly GoalContributor[]): number {
  return contributors.reduce(
    (sum, contributor) => sum + toNonNegativeCents(contributor.contributedCents),
    0,
  );
}

/**
 * Household completion as an integer percentage (0–100, capped at 100).
 * Returns 0 when the target is non-positive and nothing has been contributed.
 */
export function householdPercentComplete(
  targetCents: number,
  contributors: readonly GoalContributor[],
): number {
  const target = toNonNegativeCents(targetCents);
  const contributed = totalContributedCents(contributors);
  if (target <= 0) {
    return contributed > 0 ? 100 : 0;
  }
  return Math.min(100, Math.round((contributed / target) * 100));
}

/** Classify a contributor's share (percent) versus an even split of `count`. */
function classifyEffort(sharePercent: number, count: number): RelativeEffort {
  if (count <= 1) {
    return 'on-track';
  }
  const evenShare = 100 / count;
  if (evenShare <= 0) {
    return 'on-track';
  }
  const ratio = sharePercent / evenShare;
  if (ratio >= 1.1) {
    return 'leading';
  }
  if (ratio <= 0.9) {
    return 'catching-up';
  }
  return 'on-track';
}

/**
 * Build per-contributor progress. Shares are expressed in basis points using
 * the largest-remainder method so they always sum to exactly 10000 (100%).
 * When `privacy` is `summarized`, exact contributed cents are withheld
 * (`contributedCents: null`) while the relative share and effort remain.
 */
export function buildContributorProgress(
  contributors: readonly GoalContributor[],
  privacy: GoalContributionPrivacy = 'detailed',
): ContributorProgress[] {
  if (contributors.length === 0) {
    return [];
  }

  const amounts = contributors.map((contributor) =>
    toNonNegativeCents(contributor.contributedCents),
  );
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  const shareBpsList = total > 0 ? allocateProportionally(10000, amounts) : amounts.map(() => 0);

  return contributors.map((contributor, index) => {
    const shareBps = shareBpsList[index] ?? 0;
    const sharePercent = Math.round((shareBps / 100) * 10) / 10;
    return {
      id: contributor.id,
      name: contributor.name,
      contributedCents: privacy === 'summarized' ? null : amounts[index],
      shareBps,
      sharePercent,
      relativeEffort: classifyEffort(sharePercent, contributors.length),
    };
  });
}

/**
 * Fund ordered milestone checkpoints waterfall-style from the household total:
 * each checkpoint is filled to its `amountCents` before the next receives any
 * funds. Checkpoints later than the available funds are `upcoming`.
 */
export function buildMilestoneProgress(
  contributedCents: number,
  milestones: readonly GoalMilestone[],
): MilestoneProgress[] {
  let remainingFunds = toNonNegativeCents(contributedCents);

  return milestones.map((milestone) => {
    const amount = toNonNegativeCents(milestone.amountCents);
    const funded = Math.min(remainingFunds, amount);
    remainingFunds -= funded;
    const remaining = Math.max(0, amount - funded);
    const percentComplete = amount > 0 ? Math.min(100, Math.floor((funded / amount) * 100)) : 100;
    const status: MilestoneProgress['status'] =
      amount === 0 || funded >= amount ? 'complete' : funded > 0 ? 'in-progress' : 'upcoming';

    return {
      id: milestone.id,
      label: milestone.label,
      amountCents: amount,
      fundedCents: funded,
      remainingCents: remaining,
      percentComplete,
      status,
    };
  });
}

// ---------------------------------------------------------------------------
// Suggested monthly contributions
// ---------------------------------------------------------------------------

/** Options controlling the per-person split of suggested monthly contributions. */
export interface SuggestedMonthlyOptions {
  /**
   * When `true` and every contributor has a positive `monthlyIncomeCents`, the
   * suggested monthly amounts are split in proportion to income. Otherwise the
   * split is even.
   */
  readonly incomeWeighted?: boolean;
}

/** Result of {@link suggestedMonthlyContributions}. */
export interface SuggestedMonthlyPlan {
  /** Total monthly amount the household should save, in integer cents. */
  readonly householdMonthlyCents: number;
  /** Number of whole months used for the calculation (always ≥ 1). */
  readonly months: number;
  /** Whether the per-person split is income-weighted. */
  readonly incomeWeighted: boolean;
  /** Per-person suggestions summing exactly to `householdMonthlyCents`. */
  readonly perPerson: readonly SuggestedMonthlyContribution[];
}

/**
 * Compute the household monthly target and split it across contributors.
 *
 * The household monthly target is `ceil(remaining / months)` so the goal is met
 * (or slightly exceeded) by the deadline. The per-person amounts are produced
 * with the largest-remainder method and therefore sum *exactly* to the
 * household monthly target — no lost or created cents.
 *
 * @param remainingCents - Cents still required to reach the target.
 * @param monthsRemaining - Whole months until the deadline (clamped to ≥ 1).
 * @param contributors - The people sharing the goal.
 * @param options - Even vs income-weighted split.
 */
export function suggestedMonthlyContributions(
  remainingCents: number,
  monthsRemaining: number,
  contributors: readonly GoalContributor[],
  options: SuggestedMonthlyOptions = {},
): SuggestedMonthlyPlan {
  const remaining = toNonNegativeCents(remainingCents);
  const months = Math.max(1, Math.floor(Number.isFinite(monthsRemaining) ? monthsRemaining : 1));
  const householdMonthlyCents = Math.ceil(remaining / months);

  if (contributors.length === 0) {
    return { householdMonthlyCents, months, incomeWeighted: false, perPerson: [] };
  }

  const incomes = contributors.map((contributor) =>
    toNonNegativeCents(contributor.monthlyIncomeCents ?? 0),
  );
  const canIncomeWeight =
    options.incomeWeighted === true &&
    incomes.every((income) => income > 0) &&
    incomes.reduce((sum, income) => sum + income, 0) > 0;

  const weights = canIncomeWeight ? incomes : contributors.map(() => 1);
  const split = allocateProportionally(householdMonthlyCents, weights);

  return {
    householdMonthlyCents,
    months,
    incomeWeighted: canIncomeWeight,
    perPerson: contributors.map((contributor, index) => ({
      id: contributor.id,
      name: contributor.name,
      monthlyCents: split[index] ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Whole months between two ISO `YYYY-MM-DD` dates, clamped to a minimum of 1.
 * A partial month (target day-of-month later than the start) rounds up so the
 * deadline is never under-counted. Returns `null` for invalid input.
 */
export function monthsUntil(fromIso: string, toIso: string): number | null {
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null;
  }
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() > from.getUTCDate()) {
    months += 1;
  }
  return Math.max(1, months);
}

// ---------------------------------------------------------------------------
// Top-level summary
// ---------------------------------------------------------------------------

/**
 * Combine every calculation into a single {@link SharedGoalSummary} for the UI.
 */
export function summarizeSharedGoal(
  targetCents: number,
  contributors: readonly GoalContributor[],
  milestones: readonly GoalMilestone[] = [],
  privacy: GoalContributionPrivacy = 'detailed',
): SharedGoalSummary {
  const target = toNonNegativeCents(targetCents);
  const contributed = totalContributedCents(contributors);

  return {
    targetCents: target,
    contributedCents: contributed,
    remainingCents: Math.max(0, target - contributed),
    householdPercentComplete: householdPercentComplete(target, contributors),
    contributors: buildContributorProgress(contributors, privacy),
    milestones: buildMilestoneProgress(contributed, milestones),
    privacy,
  };
}

/** Human-readable label for a {@link RelativeEffort} value (text, not colour). */
export function relativeEffortLabel(effort: RelativeEffort): string {
  switch (effort) {
    case 'leading':
      return 'Leading';
    case 'catching-up':
      return 'Catching up';
    default:
      return 'On track';
  }
}
