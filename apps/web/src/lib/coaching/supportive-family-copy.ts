// SPDX-License-Identifier: BUSL-1.1

/**
 * Supportive, non-judgmental coaching copy for the single-parent / tight-budget
 * persona.
 *
 * Money coaching for caregivers who are doing their best on a tight budget has
 * to be encouraging and shame-free. Instead of flagging a category as "over
 * budget", these variants reframe a hard month as just a hard month and offer
 * one small, concrete win to carry forward.
 *
 * The copy is a structured, pure data set plus a deterministic selector so it
 * can be unit-tested and reused anywhere coaching copy is surfaced for this
 * persona (dashboard nudges, onboarding, the categories surface, etc.).
 *
 * References: issue #2201
 */

/** Emotional register of a supportive message. */
export type SupportiveCopyTone = 'reassuring' | 'celebratory' | 'supportive';

/** Stable identifiers for each supportive copy variant. */
export type SupportiveFamilyCopyId =
  'tight-month-reframe' | 'celebrate-small-win' | 'family-ready' | 'steady-and-supported';

/** A single piece of supportive coaching copy. */
export interface SupportiveFamilyCopy {
  /** Stable identifier. */
  readonly id: SupportiveFamilyCopyId;
  /** Emotional register, useful for styling and analytics. */
  readonly tone: SupportiveCopyTone;
  /** Short, encouraging headline. */
  readonly headline: string;
  /** One or two sentences of shame-free context. */
  readonly body: string;
  /** A single, concrete, low-pressure next step. */
  readonly smallWin: string;
}

/**
 * The full supportive copy set for this persona.
 *
 * Frozen so callers cannot mutate shared copy by accident.
 */
export const SUPPORTIVE_FAMILY_COACHING_COPY: Readonly<
  Record<SupportiveFamilyCopyId, SupportiveFamilyCopy>
> = Object.freeze({
  'tight-month-reframe': {
    id: 'tight-month-reframe',
    tone: 'reassuring',
    headline: 'This month was tight, and that is okay',
    body: 'Family costs rarely arrive on a tidy schedule. A tight month is just a tight month, not a verdict on you or how you parent.',
    smallWin:
      'Pick one small win for next month. Even setting aside a few dollars toward birthdays counts.',
  },
  'celebrate-small-win': {
    id: 'celebrate-small-win',
    tone: 'celebratory',
    headline: 'That is a real win',
    body: 'You made room for your family this month. Small, steady steps are exactly how budgets hold up over time.',
    smallWin: 'Notice what worked this month, and let it repeat next month.',
  },
  'family-ready': {
    id: 'family-ready',
    tone: 'supportive',
    headline: 'Your family categories are ready',
    body: 'These envelopes flex with real life: school fees, childcare, sports, and the surprises in between. Every amount is yours to adjust.',
    smallWin: 'Start with the one category that feels most urgent this week.',
  },
  'steady-and-supported': {
    id: 'steady-and-supported',
    tone: 'supportive',
    headline: 'You are doing this, one month at a time',
    body: 'Budgeting for a family is a lot to carry. You do not have to be perfect here, just present.',
    smallWin: 'Check in on a single category today; that is enough for now.',
  },
});

/** Context used to choose the most relevant supportive message. */
export interface SupportiveFamilyCopyContext {
  /**
   * Name of a category that ran tight this period. When present, the selector
   * reframes the overage supportively instead of flagging it.
   */
  readonly tightCategoryName?: string | null;
  /** The caregiver kept or grew savings, or otherwise had a clear win. */
  readonly hadSmallWin?: boolean;
  /** The family/kids category preset is fully set up. */
  readonly presetComplete?: boolean;
}

/** List every supportive copy variant. */
export function listSupportiveFamilyCopy(): readonly SupportiveFamilyCopy[] {
  return Object.values(SUPPORTIVE_FAMILY_COACHING_COPY);
}

/** Look up a supportive copy variant by id. */
export function getSupportiveFamilyCopy(id: SupportiveFamilyCopyId): SupportiveFamilyCopy {
  return SUPPORTIVE_FAMILY_COACHING_COPY[id];
}

/**
 * Choose the most relevant supportive copy for the current context.
 *
 * Selection is deterministic and prioritized:
 * 1. A tight category → reframe the hard month supportively.
 * 2. A clear win → celebrate it.
 * 3. A freshly completed preset → welcome the caregiver.
 * 4. Otherwise → steady, present encouragement.
 *
 * @param context - Signals describing the caregiver's current month.
 * @returns The selected supportive copy variant.
 */
export function selectSupportiveFamilyCopy(
  context: SupportiveFamilyCopyContext = {},
): SupportiveFamilyCopy {
  if (context.tightCategoryName) {
    return SUPPORTIVE_FAMILY_COACHING_COPY['tight-month-reframe'];
  }

  if (context.hadSmallWin) {
    return SUPPORTIVE_FAMILY_COACHING_COPY['celebrate-small-win'];
  }

  if (context.presetComplete) {
    return SUPPORTIVE_FAMILY_COACHING_COPY['family-ready'];
  }

  return SUPPORTIVE_FAMILY_COACHING_COPY['steady-and-supported'];
}
