// SPDX-License-Identifier: BUSL-1.1

/**
 * On-device transaction categorisation engine.
 *
 * Runs entirely client-side — no server calls. The engine applies a
 * prioritised matching pipeline:
 *
 * 1. **User-learned rules** (highest priority — from manual corrections)
 * 2. **Exact built-in match** (merchant keyword === normalised description)
 * 3. **Partial built-in match** (keyword is a substring of the description)
 * 4. **Amount-based heuristic** (low-confidence fallback)
 *
 * Each step produces a {@link CategorySuggestion} with a `confidence` score
 * (0–1) and a `source` tag indicating how the match was derived.
 *
 * @module lib/categorization/categorization-engine
 */

import type { Category } from '../../kmp/bridge';
import { getAmountHint, normaliseDescription } from './patterns';
import { findExactBuiltinMatch, findPartialBuiltinMatch } from './rules';
import { findUserRule } from './user-rules';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The source that produced a category suggestion. */
export type SuggestionSource = 'builtin' | 'user' | 'pattern';

/** Result returned by the categorisation engine. */
export interface CategorySuggestion {
  /** The ID of the suggested category. */
  readonly categoryId: string;
  /** Human-readable category name (for display before lookup). */
  readonly categoryName: string;
  /** Confidence score in the range [0, 1]. */
  readonly confidence: number;
  /** How the suggestion was derived. */
  readonly source: SuggestionSource;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Suggest a category for a transaction.
 *
 * @param description  The merchant / payee description (e.g. "Walmart Supercenter #1234").
 * @param categories   The user's available categories (used to resolve names → IDs).
 * @param amountCents  Optional transaction amount in cents (for heuristic fallback).
 * @returns A suggestion, or `null` if no confident match could be made.
 */
export function suggestCategory(
  description: string,
  categories: Category[],
  amountCents?: number,
): CategorySuggestion | null {
  if (!description.trim()) return null;

  const normalised = normaliseDescription(description);

  // -- Step 1: User-learned rules (highest priority) -----------------------
  const userRule = findUserRule(description);
  if (userRule) {
    const cat = categories.find((c) => c.id === userRule.categoryId);
    return {
      categoryId: userRule.categoryId,
      categoryName: cat?.name ?? 'Unknown',
      confidence: 0.95,
      source: 'user',
    };
  }

  // -- Step 2: Exact built-in match ----------------------------------------
  const exactMatch = findExactBuiltinMatch(normalised);
  if (exactMatch) {
    const cat = resolveCategoryByName(exactMatch.categoryName, categories);
    if (cat) {
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        confidence: 0.9,
        source: 'builtin',
      };
    }
  }

  // -- Step 3: Partial/substring match ------------------------------------
  const partialMatch = findPartialBuiltinMatch(normalised);
  if (partialMatch) {
    const cat = resolveCategoryByName(partialMatch.categoryName, categories);
    if (cat) {
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        confidence: 0.75,
        source: 'builtin',
      };
    }
  }

  // -- Step 4: Amount-based heuristic (low confidence) --------------------
  if (amountCents !== undefined) {
    const hint = getAmountHint(amountCents);
    if (hint) {
      const cat = resolveCategoryByName(hint.categoryName, categories);
      if (cat) {
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          confidence: 0.3,
          source: 'pattern',
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a category from the provided list by name (case-insensitive).
 */
function resolveCategoryByName(name: string, categories: Category[]): Category | null {
  const lower = name.toLowerCase();
  return categories.find((c) => c.name.toLowerCase() === lower) ?? null;
}
