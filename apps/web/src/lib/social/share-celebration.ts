// SPDX-License-Identifier: BUSL-1.1

/**
 * Privacy-safe celebration share-content builder.
 *
 * Turns a savings-goal milestone, goal completion, badge/achievement unlock,
 * or streak into a deterministic, shareable payload that a teen can post to
 * friends WITHOUT exposing private balances.
 *
 * Raw currency figures are redacted by default by routing every amount through
 * the existing redaction engine ({@link redactShareCard}). A raw amount is only
 * ever surfaced when the user explicitly opts in via {@link ShareCelebrationOptions.revealAmount}.
 *
 * The builder is pure and deterministic: identical input always yields identical
 * output (no clock reads, no randomness, fixed `en-US` formatting locale).
 *
 * Refs #2210
 */

import {
  redactShareCard,
  type RedactionPolicy,
  type ShareCardPayload,
  type ShareCardType,
} from './share-card-redaction';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Savings-goal milestone thresholds eligible for sharing. */
export type GoalMilestonePercent = 25 | 50 | 75 | 100;

/** A celebratory event a teen can share. */
export type CelebrationEvent =
  | {
      readonly kind: 'goal-milestone';
      readonly goalName: string;
      readonly percent: GoalMilestonePercent;
      readonly nickname?: string;
      readonly amountCents?: number;
      readonly currency?: string;
    }
  | {
      readonly kind: 'goal-completion';
      readonly goalName: string;
      readonly nickname?: string;
      readonly amountCents?: number;
      readonly currency?: string;
    }
  | {
      readonly kind: 'badge-unlock';
      readonly badgeName: string;
      readonly badgeDescription?: string;
      readonly nickname?: string;
    }
  | {
      readonly kind: 'streak-milestone';
      readonly streakLabel: string;
      readonly days: number;
      readonly nickname?: string;
    };

/** Options controlling what the share card reveals. */
export interface ShareCelebrationOptions {
  /**
   * Opt-in to reveal the raw saved amount in the shared card.
   *
   * Defaults to `false`, guaranteeing balances stay private. Only goal events
   * carry an amount; badge and streak events never include a balance.
   */
  readonly revealAmount?: boolean;
}

/** A fully-built, privacy-safe celebration ready to share. */
export interface ShareCelebration {
  /** Redaction card type this celebration maps to. */
  readonly type: ShareCardType;
  /** Short celebratory headline (always safe to display). */
  readonly title: string;
  /** Celebratory body describing the win without raw balances. */
  readonly message: string;
  /** Redacted percent-to-goal (0-100) when applicable, otherwise `null`. */
  readonly percentComplete: number | null;
  /** Formatted amount, only present when the user opts in to reveal it. */
  readonly amountLabel: string | null;
  /** Deterministic hashtags appended to the share text. */
  readonly hashtags: readonly string[];
  /** Full shareable text (title + message + optional amount + hashtags). */
  readonly shareText: string;
  /** `true` only when a raw currency figure is included (opt-in reveal). */
  readonly containsRawAmount: boolean;
}

/** Minimal payload shape compatible with the Web Share API. */
export interface ShareData {
  readonly title: string;
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CURRENCY = 'USD';
/** Fixed locale keeps amount formatting deterministic across environments. */
const SHARE_LOCALE = 'en-US';
/** Placeholder display name required by the redaction payload contract. */
const ANON_DISPLAY_NAME = 'A saver';

const MILESTONE_TITLES: Record<GoalMilestonePercent, string> = {
  25: 'Off to a strong start! 🌱',
  50: 'Halfway there! 🎯',
  75: 'Almost at the finish line! 🚀',
  100: 'Goal complete! 🏆',
};

const HASHTAGS: Record<ShareCardType, readonly string[]> = {
  'goal-milestone': ['#SavingsGoals', '#MoneyWins'],
  'goal-completion': ['#GoalCrushed', '#SavingsGoals', '#MoneyWins'],
  'badge-unlock': ['#BadgeUnlocked', '#MoneyWins'],
  'streak-milestone': ['#StreakAlive', '#MoneyWins'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(SHARE_LOCALE, {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}

interface CelebrationDraft {
  readonly type: ShareCardType;
  readonly title: string;
  readonly message: string;
  /** Percent-to-goal known from the event (safe, non-balance figure). */
  readonly percentComplete: number | null;
  /** Redaction payload routed through the existing engine. */
  readonly payload: ShareCardPayload;
}

function draftFromEvent(event: CelebrationEvent): CelebrationDraft {
  const nickname = event.nickname?.trim() || ANON_DISPLAY_NAME;

  switch (event.kind) {
    case 'goal-milestone':
      return {
        type: 'goal-milestone',
        title: MILESTONE_TITLES[event.percent],
        message: `I just hit ${event.percent}% of my "${event.goalName}" savings goal!`,
        percentComplete: event.percent,
        payload: {
          type: 'goal-milestone',
          title: event.goalName,
          nickname,
          amountCents: event.amountCents,
          percentComplete: event.percent,
        },
      };
    case 'goal-completion':
      return {
        type: 'goal-completion',
        title: MILESTONE_TITLES[100],
        message: `I just completed my "${event.goalName}" savings goal! 🎉`,
        percentComplete: 100,
        payload: {
          type: 'goal-completion',
          title: event.goalName,
          nickname,
          amountCents: event.amountCents,
          percentComplete: 100,
        },
      };
    case 'badge-unlock': {
      const description = event.badgeDescription?.trim();
      return {
        type: 'badge-unlock',
        title: 'Badge unlocked! 🏅',
        message: description
          ? `I just earned the "${event.badgeName}" badge — ${description}!`
          : `I just earned the "${event.badgeName}" badge!`,
        percentComplete: null,
        payload: {
          type: 'badge-unlock',
          title: event.badgeName,
          nickname,
        },
      };
    }
    case 'streak-milestone': {
      const dayWord = event.days === 1 ? 'day' : 'days';
      return {
        type: 'streak-milestone',
        title: `${event.days}-${dayWord} streak! 🔥`,
        message: `I'm on a ${event.days}-${dayWord} ${event.streakLabel} streak. Consistency pays off!`,
        percentComplete: null,
        payload: {
          type: 'streak-milestone',
          title: event.streakLabel,
          nickname,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a privacy-safe, shareable celebration from an event.
 *
 * The raw amount is redacted by default. Pass `{ revealAmount: true }` to opt
 * in to showing the saved amount; the value is still routed through the
 * existing redaction engine so the privacy contract stays centralized.
 */
export function buildShareCelebration(
  event: CelebrationEvent,
  options: ShareCelebrationOptions = {},
): ShareCelebration {
  const revealAmount = options.revealAmount === true;
  const draft = draftFromEvent(event);

  // `nickname-only` retains the amount (opt-in reveal); `percent-only` strips it
  // (the privacy-safe default). Either way the amount passes through the
  // existing redaction engine — the single source of truth for what leaks.
  const policy: RedactionPolicy = revealAmount ? 'nickname-only' : 'percent-only';
  const redacted = redactShareCard(draft.payload, policy);

  const currency =
    (event.kind === 'goal-milestone' || event.kind === 'goal-completion'
      ? event.currency
      : undefined) ?? DEFAULT_CURRENCY;

  const amountLabel =
    redacted.amountCents !== null ? formatAmount(redacted.amountCents, currency) : null;
  const containsRawAmount = amountLabel !== null;

  const hashtags = HASHTAGS[draft.type];

  const lines = [draft.title, draft.message];
  if (amountLabel !== null) {
    lines.push(`Saved so far: ${amountLabel}`);
  }
  const shareText = `${lines.join('\n')}\n\n${hashtags.join(' ')}`;

  return {
    type: draft.type,
    title: draft.title,
    message: draft.message,
    percentComplete: draft.percentComplete,
    amountLabel,
    hashtags,
    shareText,
    containsRawAmount,
  };
}

/** Convert a built celebration into a Web Share API payload. */
export function toShareData(celebration: ShareCelebration): ShareData {
  return { title: celebration.title, text: celebration.shareText };
}

/**
 * Resolve the most relevant celebration event for a goal's current progress.
 *
 * Returns `null` below the first shareable milestone (25%) so callers can hide
 * the share affordance until there is something worth celebrating.
 */
export function goalCelebrationEvent(params: {
  goalName: string;
  percentComplete: number;
  amountCents?: number;
  currency?: string;
  nickname?: string;
}): CelebrationEvent | null {
  const { goalName, percentComplete, amountCents, currency, nickname } = params;

  if (percentComplete >= 100) {
    return { kind: 'goal-completion', goalName, amountCents, currency, nickname };
  }

  const reached = ([75, 50, 25] as const).find((m) => percentComplete >= m);
  if (reached === undefined) {
    return null;
  }

  return {
    kind: 'goal-milestone',
    goalName,
    percent: reached,
    amountCents,
    currency,
    nickname,
  };
}
