// SPDX-License-Identifier: BUSL-1.1

/**
 * Contextual tooltip / progressive disclosure engine.
 *
 * Manages a system of contextual tooltips that appear as users encounter
 * features for the first time, replacing long tutorials with just-in-time
 * guidance. Tracks dismissals, show counts, and feature encounters.
 *
 * All operations are pure and immutable — inputs are never mutated.
 *
 * References: issue #1713
 */

import type { TooltipConfig, TooltipState } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** localStorage key for tooltip dismissal/encounter state. */
export const TOOLTIP_STORAGE_KEY = 'finance-tooltip-state';

/** Default empty tooltip state. */
export const DEFAULT_TOOLTIP_STATE: TooltipState = {
  dismissed: {},
  showCounts: {},
  encounteredFeatures: {},
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Load tooltip state from localStorage.
 *
 * Returns defaults if no state is stored or if parsing fails.
 *
 * @returns Persisted or default tooltip state.
 */
export function loadTooltipState(): TooltipState {
  try {
    const raw = globalThis.localStorage?.getItem(TOOLTIP_STORAGE_KEY);
    if (!raw) return DEFAULT_TOOLTIP_STATE;
    const parsed = JSON.parse(raw) as Partial<TooltipState>;
    return { ...DEFAULT_TOOLTIP_STATE, ...parsed };
  } catch {
    return DEFAULT_TOOLTIP_STATE;
  }
}

/**
 * Save tooltip state to localStorage.
 *
 * @param state - Tooltip state to persist.
 */
export function saveTooltipState(state: TooltipState): void {
  try {
    globalThis.localStorage?.setItem(TOOLTIP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently fail — storage might be full or unavailable
  }
}

// ---------------------------------------------------------------------------
// Feature encounter tracking
// ---------------------------------------------------------------------------

/**
 * Mark a feature as encountered by the user.
 *
 * @param state   - Current tooltip state.
 * @param feature - Feature identifier being encountered.
 * @returns Updated tooltip state.
 */
export function markFeatureEncountered(state: TooltipState, feature: string): TooltipState {
  return {
    ...state,
    encounteredFeatures: {
      ...state.encounteredFeatures,
      [feature]: true,
    },
  };
}

/**
 * Check whether a feature has been encountered.
 *
 * @param state   - Current tooltip state.
 * @param feature - Feature identifier to check.
 * @returns `true` if the feature has been encountered.
 */
export function hasEncounteredFeature(state: TooltipState, feature: string): boolean {
  return state.encounteredFeatures[feature] === true;
}

// ---------------------------------------------------------------------------
// Tooltip visibility logic
// ---------------------------------------------------------------------------

/**
 * Determine whether a tooltip should be shown right now.
 *
 * A tooltip is shown when:
 * 1. The user has encountered the target feature.
 * 2. The tooltip has not been dismissed (if `showOnce` is true).
 *
 * @param tooltip - Tooltip configuration.
 * @param state   - Current tooltip state.
 * @returns `true` if the tooltip should be visible.
 */
export function shouldShowTooltip(tooltip: TooltipConfig, state: TooltipState): boolean {
  // Feature must have been encountered
  if (!state.encounteredFeatures[tooltip.targetFeature]) return false;

  // If show-once and already dismissed, don't show
  if (tooltip.showOnce && state.dismissed[tooltip.id]) return false;

  return true;
}

/**
 * Get all tooltips that should be shown for the current state.
 *
 * Returns tooltips sorted by their `order` field (ascending).
 *
 * @param tooltips - All available tooltip configurations.
 * @param state    - Current tooltip state.
 * @returns Filtered and sorted array of tooltips to display.
 */
export function getVisibleTooltips(
  tooltips: readonly TooltipConfig[],
  state: TooltipState,
): TooltipConfig[] {
  return tooltips.filter((t) => shouldShowTooltip(t, state)).sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// Dismissal
// ---------------------------------------------------------------------------

/**
 * Dismiss a tooltip, updating the state to prevent future display.
 *
 * Also increments the show count.
 *
 * @param state     - Current tooltip state.
 * @param tooltipId - Identifier of the tooltip to dismiss.
 * @returns Updated tooltip state.
 */
export function dismissTooltip(state: TooltipState, tooltipId: string): TooltipState {
  const currentCount = state.showCounts[tooltipId] ?? 0;
  return {
    ...state,
    dismissed: {
      ...state.dismissed,
      [tooltipId]: true,
    },
    showCounts: {
      ...state.showCounts,
      [tooltipId]: currentCount + 1,
    },
  };
}

/**
 * Reset a tooltip so it can be shown again.
 *
 * @param state     - Current tooltip state.
 * @param tooltipId - Identifier of the tooltip to reset.
 * @returns Updated tooltip state.
 */
export function resetTooltip(state: TooltipState, tooltipId: string): TooltipState {
  const { [tooltipId]: _dismissed, ...remainingDismissed } = state.dismissed;
  return {
    ...state,
    dismissed: remainingDismissed,
  };
}

/**
 * Reset all tooltips and encountered features.
 *
 * @returns A fresh default tooltip state.
 */
export function resetAllTooltips(): TooltipState {
  return DEFAULT_TOOLTIP_STATE;
}

/**
 * Get the number of times a tooltip has been shown.
 *
 * @param state     - Current tooltip state.
 * @param tooltipId - Tooltip identifier.
 * @returns Number of times the tooltip was shown (dismissed).
 */
export function getTooltipShowCount(state: TooltipState, tooltipId: string): number {
  return state.showCounts[tooltipId] ?? 0;
}

/**
 * Get the next tooltip to show for a given feature.
 *
 * Returns the lowest-order undismissed tooltip for the feature, or null.
 *
 * @param tooltips - All available tooltip configurations.
 * @param state    - Current tooltip state.
 * @param feature  - Feature identifier to get the next tooltip for.
 * @returns The next tooltip to display, or `null` if none.
 */
export function getNextTooltipForFeature(
  tooltips: readonly TooltipConfig[],
  state: TooltipState,
  feature: string,
): TooltipConfig | null {
  const visible = tooltips
    .filter((t) => t.targetFeature === feature && shouldShowTooltip(t, state))
    .sort((a, b) => a.order - b.order);

  return visible[0] ?? null;
}
