// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for tracking milestone achievements.
 *
 * Determines which milestones to show based on user progress,
 * persists dismissed milestones to localStorage, and provides
 * callbacks for dismissal (including "don't show again").
 *
 * Usage:
 * ```tsx
 * const { activeMilestones, dismiss, dismissPermanently } = useMilestones({
 *   transactionCount: 1,
 *   budgetCount: 0,
 *   goalCount: 0,
 *   goalProgress: [],
 *   streak: 7,
 * });
 * ```
 *
 * @module hooks/useMilestones
 */

import { useCallback, useMemo, useState } from 'react';
import type { IconName } from '../components/icons';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The kind of milestone being celebrated. */
export type MilestoneType =
  | 'goal-25'
  | 'goal-50'
  | 'goal-75'
  | 'goal-100'
  | 'first-transaction'
  | 'first-budget'
  | 'first-goal'
  | 'streak-7'
  | 'streak-30'
  | 'streak-90';

/** A milestone ready to be shown to the user. */
export interface Milestone {
  /** Unique type identifier. */
  type: MilestoneType;
  /** Display title. */
  title: string;
  /** Description text. */
  description: string;
  /** Icon name for the celebration. */
  icon: IconName;
}

/** Progress data supplied to the hook. */
export interface MilestoneProgress {
  /** Total number of transactions created. */
  transactionCount: number;
  /** Total number of budgets created. */
  budgetCount: number;
  /** Total number of goals created. */
  goalCount: number;
  /** Progress fraction for each goal (0–1). */
  goalProgress: ReadonlyArray<{ goalId: string; fraction: number }>;
  /** Current daily logging streak. */
  streak: number;
}

/** Shape returned by {@link useMilestones}. */
export interface UseMilestonesResult {
  /** Milestones that should be displayed right now. */
  activeMilestones: ReadonlyArray<Milestone>;
  /** Dismiss a milestone for this session only. */
  dismiss: (type: MilestoneType) => void;
  /** Dismiss a milestone permanently (persisted to localStorage). */
  dismissPermanently: (type: MilestoneType) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'finance:dismissed-milestones';

/** Read permanently dismissed milestones from localStorage. */
function loadDismissed(): Set<MilestoneType> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as MilestoneType[]);
  } catch {
    return new Set();
  }
}

/** Save permanently dismissed milestones to localStorage. */
function saveDismissed(dismissed: Set<MilestoneType>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Storage may be unavailable; silently fail.
  }
}

// ---------------------------------------------------------------------------
// Milestone definitions
// ---------------------------------------------------------------------------

const MILESTONE_DEFS: Record<
  MilestoneType,
  { title: string; description: string; icon: IconName }
> = {
  'first-transaction': {
    title: 'First Transaction!',
    description: 'You logged your first transaction. Great start!',
    icon: 'sparkles',
  },
  'first-budget': {
    title: 'Budget Created!',
    description: 'Your first budget is set up. Stay on track!',
    icon: 'chart-bar',
  },
  'first-goal': {
    title: 'Goal Set!',
    description: 'You created your first savings goal. Keep going!',
    icon: 'target',
  },
  'goal-25': {
    title: '25% There!',
    description: "You've reached a quarter of your goal!",
    icon: 'leaf',
  },
  'goal-50': {
    title: 'Halfway!',
    description: "You're at 50% of your savings goal!",
    icon: 'sparkles',
  },
  'goal-75': {
    title: 'Almost There!',
    description: '75% complete — the finish line is in sight!',
    icon: 'flame',
  },
  'goal-100': {
    title: 'Goal Achieved!',
    description: 'Congratulations! You reached your savings goal!',
    icon: 'trophy',
  },
  'streak-7': {
    title: '7-Day Streak!',
    description: 'A whole week of consistent logging!',
    icon: 'calendar',
  },
  'streak-30': {
    title: '30-Day Streak!',
    description: "A full month — you're building a habit!",
    icon: 'trophy',
  },
  'streak-90': {
    title: '90-Day Streak!',
    description: 'Three months strong! Incredible dedication!',
    icon: 'medal',
  },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Track and display milestone celebrations based on user progress.
 */
export function useMilestones(progress: MilestoneProgress): UseMilestonesResult {
  const [permanentlyDismissed, setPermanentlyDismissed] = useState<Set<MilestoneType>>(() =>
    loadDismissed(),
  );
  const [sessionDismissed, setSessionDismissed] = useState<Set<MilestoneType>>(new Set());

  // Compute which milestones the user has earned
  const earned = useMemo<MilestoneType[]>(() => {
    const result: MilestoneType[] = [];

    // Onboarding milestones
    if (progress.transactionCount >= 1) result.push('first-transaction');
    if (progress.budgetCount >= 1) result.push('first-budget');
    if (progress.goalCount >= 1) result.push('first-goal');

    // Goal progress milestones
    for (const goal of progress.goalProgress) {
      if (goal.fraction >= 1) result.push('goal-100');
      else if (goal.fraction >= 0.75) result.push('goal-75');
      else if (goal.fraction >= 0.5) result.push('goal-50');
      else if (goal.fraction >= 0.25) result.push('goal-25');
    }

    // Streak milestones
    if (progress.streak >= 90) result.push('streak-90');
    else if (progress.streak >= 30) result.push('streak-30');
    else if (progress.streak >= 7) result.push('streak-7');

    // Deduplicate
    return [...new Set(result)];
  }, [progress]);

  // Filter out dismissed milestones
  const activeMilestones = useMemo<Milestone[]>(() => {
    return earned
      .filter((type) => !permanentlyDismissed.has(type) && !sessionDismissed.has(type))
      .map((type) => ({
        type,
        ...MILESTONE_DEFS[type],
      }));
  }, [earned, permanentlyDismissed, sessionDismissed]);

  const dismiss = useCallback((type: MilestoneType) => {
    setSessionDismissed((prev) => new Set(prev).add(type));
  }, []);

  const dismissPermanently = useCallback((type: MilestoneType) => {
    setPermanentlyDismissed((prev) => {
      const next = new Set(prev).add(type);
      saveDismissed(next);
      return next;
    });
  }, []);

  return {
    activeMilestones,
    dismiss,
    dismissPermanently,
  };
}
