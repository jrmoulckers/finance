// SPDX-License-Identifier: BUSL-1.1

/**
 * Cognitive simplification engine.
 *
 * Provides multiple levels of interface simplification to reduce cognitive
 * load. Each level controls feature visibility, information density, touch
 * target sizes, and the number of options shown.
 *
 * All operations are pure and immutable — inputs are never mutated.
 *
 * References: issue #1703
 */

import type { FeatureVisibility, SimplificationLevel, SimplificationStyles } from './types';

// ---------------------------------------------------------------------------
// Feature visibility per level
// ---------------------------------------------------------------------------

/** Feature visibility for each simplification level. */
const FEATURE_VISIBILITY: Readonly<Record<SimplificationLevel, FeatureVisibility>> = {
  standard: {
    showAdvancedCharts: true,
    showTransactionDetails: true,
    showBudgetAnalytics: true,
    showInvestments: true,
    showDebtTools: true,
    showMultiAccount: true,
    maxMenuItems: 10,
    autoShowTooltips: false,
  },
  simplified: {
    showAdvancedCharts: false,
    showTransactionDetails: true,
    showBudgetAnalytics: true,
    showInvestments: false,
    showDebtTools: false,
    showMultiAccount: true,
    maxMenuItems: 6,
    autoShowTooltips: true,
  },
  minimal: {
    showAdvancedCharts: false,
    showTransactionDetails: false,
    showBudgetAnalytics: false,
    showInvestments: false,
    showDebtTools: false,
    showMultiAccount: false,
    maxMenuItems: 4,
    autoShowTooltips: true,
  },
};

/** CSS-level style overrides for each simplification level. */
const SIMPLIFICATION_STYLES: Readonly<Record<SimplificationLevel, SimplificationStyles>> = {
  standard: {
    minTouchTargetPx: 44,
    fontSizeMultiplier: 1.0,
    reducedDensity: false,
    maxListItems: 50,
  },
  simplified: {
    minTouchTargetPx: 48,
    fontSizeMultiplier: 1.1,
    reducedDensity: true,
    maxListItems: 20,
  },
  minimal: {
    minTouchTargetPx: 56,
    fontSizeMultiplier: 1.25,
    reducedDensity: true,
    maxListItems: 10,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the feature visibility settings for a simplification level.
 *
 * @param level - The simplification level.
 * @returns Feature visibility configuration.
 */
export function getFeatureVisibility(level: SimplificationLevel): FeatureVisibility {
  return FEATURE_VISIBILITY[level];
}

/**
 * Get the CSS-level style overrides for a simplification level.
 *
 * @param level - The simplification level.
 * @returns Style override configuration.
 */
export function getSimplificationStyles(level: SimplificationLevel): SimplificationStyles {
  return SIMPLIFICATION_STYLES[level];
}

/**
 * Determine whether a specific feature should be visible at the current level.
 *
 * @param level   - The simplification level.
 * @param feature - Feature key from {@link FeatureVisibility}.
 * @returns `true` if the feature should be shown.
 */
export function isFeatureVisible(
  level: SimplificationLevel,
  feature: keyof Omit<FeatureVisibility, 'maxMenuItems' | 'autoShowTooltips'>,
): boolean {
  return FEATURE_VISIBILITY[level][feature];
}

/**
 * Filter a list of menu items to respect the max count for the level.
 *
 * @param items - Full list of menu items.
 * @param level - The simplification level.
 * @returns Truncated list respecting the level's `maxMenuItems`.
 */
export function filterMenuItems<T>(items: readonly T[], level: SimplificationLevel): T[] {
  const max = FEATURE_VISIBILITY[level].maxMenuItems;
  return items.slice(0, max);
}

/**
 * Filter a list to respect the max list items for the level.
 *
 * @param items - Full list of items.
 * @param level - The simplification level.
 * @returns Truncated list respecting the level's `maxListItems`.
 */
export function filterListItems<T>(items: readonly T[], level: SimplificationLevel): T[] {
  const max = SIMPLIFICATION_STYLES[level].maxListItems;
  return items.slice(0, max);
}

/**
 * Generate CSS custom property overrides for the given simplification level.
 *
 * These can be applied to the root element to change styling globally.
 *
 * @param level - The simplification level.
 * @returns Record of CSS custom property name → value.
 */
export function getSimplificationCssVars(level: SimplificationLevel): Record<string, string> {
  const styles = SIMPLIFICATION_STYLES[level];
  return {
    '--simplification-min-touch-target': `${styles.minTouchTargetPx}px`,
    '--simplification-font-size-multiplier': String(styles.fontSizeMultiplier),
    '--simplification-max-list-items': String(styles.maxListItems),
    '--simplification-density': styles.reducedDensity ? 'reduced' : 'normal',
  };
}

/**
 * Get all available simplification levels in order of complexity.
 *
 * @returns Array of simplification levels from most complex to simplest.
 */
export function getSimplificationLevels(): SimplificationLevel[] {
  return ['standard', 'simplified', 'minimal'];
}
