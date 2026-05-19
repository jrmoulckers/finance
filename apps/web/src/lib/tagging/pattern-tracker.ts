// SPDX-License-Identifier: BUSL-1.1

/**
 * Pattern tracker for learning tag suggestions from user behaviour.
 *
 * Tracks which tags users manually apply to transactions, building
 * frequency maps keyed by counterparty name. These patterns power
 * confidence-scored tag suggestions for new/edited transactions.
 *
 * @module lib/tagging/pattern-tracker
 * References: issue #1473
 */

import type { Transaction } from '../../kmp/bridge';
import type { TagFrequency, TaggingPattern, TagSuggestion } from './tagging-types';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const PATTERNS_STORAGE_KEY = 'finance-tagging-patterns';

/** Minimum confidence threshold for showing a suggestion (10%). */
const MIN_CONFIDENCE = 0.1;

/** Maximum number of suggestions to return. */
const MAX_SUGGESTIONS = 5;

/** Load all tagging patterns from localStorage. */
export function loadPatterns(): TaggingPattern[] {
  try {
    const raw = localStorage.getItem(PATTERNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPattern);
  } catch {
    return [];
  }
}

/** Persist patterns to localStorage. */
export function savePatterns(patterns: TaggingPattern[]): void {
  localStorage.setItem(PATTERNS_STORAGE_KEY, JSON.stringify(patterns));
}

/** Clear all learned patterns. */
export function clearPatterns(): void {
  localStorage.removeItem(PATTERNS_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Type guard for runtime validation of pattern shape from localStorage. */
function isValidPattern(value: unknown): value is TaggingPattern {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.counterpartyName === 'string' &&
    Array.isArray(p.tags) &&
    typeof p.totalTagged === 'number' &&
    typeof p.lastUpdated === 'string'
  );
}

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

/**
 * Normalise a counterparty name for consistent pattern matching.
 *
 * Lowercases, trims, and collapses whitespace.
 */
export function normaliseCounterparty(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Record a tagging action: the user applied `tags` to a transaction
 * from the given counterparty.
 *
 * Updates existing patterns in-place or creates new ones. Each tag's
 * count is incremented by 1, and the total is incremented once per call.
 */
export function recordTagging(counterpartyName: string, tags: readonly string[]): void {
  if (!counterpartyName.trim() || tags.length === 0) return;

  const normalised = normaliseCounterparty(counterpartyName);
  const patterns = loadPatterns();
  const existing = patterns.find((p) => p.counterpartyName === normalised);

  if (existing) {
    const updatedTags = updateTagFrequencies(existing.tags, tags);
    const updated: TaggingPattern = {
      ...existing,
      tags: updatedTags,
      totalTagged: existing.totalTagged + 1,
      lastUpdated: new Date().toISOString(),
    };
    const index = patterns.indexOf(existing);
    patterns[index] = updated;
  } else {
    const newPattern: TaggingPattern = {
      counterpartyName: normalised,
      tags: tags.map((t) => ({ name: t, count: 1 })),
      totalTagged: 1,
      lastUpdated: new Date().toISOString(),
    };
    patterns.push(newPattern);
  }

  savePatterns(patterns);
}

/**
 * Update tag frequencies: increment existing counts and add new tags.
 */
function updateTagFrequencies(
  existing: readonly TagFrequency[],
  newTags: readonly string[],
): TagFrequency[] {
  const result = existing.map((tf) => ({ ...tf }));

  for (const tag of newTags) {
    const found = result.find((tf) => tf.name.toLowerCase() === tag.toLowerCase());
    if (found) {
      found.count += 1;
    } else {
      result.push({ name: tag, count: 1 });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/**
 * Get suggested tags for a transaction based on historical patterns.
 *
 * Matches primarily by counterparty name (exact normalised match).
 * Returns tags sorted by confidence (highest first), filtered above
 * the minimum confidence threshold.
 *
 * Confidence = tagCount / totalTaggedTransactionsForCounterparty
 */
export function getSuggestedTags(transaction: Transaction): TagSuggestion[] {
  if (!transaction.payee) return [];

  const normalised = normaliseCounterparty(transaction.payee);
  const patterns = loadPatterns();

  // Primary match: exact counterparty
  const exactMatch = patterns.find((p) => p.counterpartyName === normalised);

  if (exactMatch && exactMatch.totalTagged > 0) {
    return buildSuggestions(
      exactMatch,
      `${exactMatch.totalTagged} similar ${transaction.payee} transactions`,
    );
  }

  // Secondary match: partial counterparty match
  const partialMatches = patterns.filter(
    (p) => p.counterpartyName.includes(normalised) || normalised.includes(p.counterpartyName),
  );

  if (partialMatches.length > 0) {
    // Merge frequencies from partial matches
    const merged = mergePatterns(partialMatches);
    return buildSuggestions(merged, `similar transactions`);
  }

  return [];
}

/**
 * Build suggestion objects from a pattern's tag frequencies.
 */
function buildSuggestions(pattern: TaggingPattern, reasonContext: string): TagSuggestion[] {
  if (pattern.totalTagged === 0) return [];

  return pattern.tags
    .map((tf) => ({
      tag: tf.name,
      confidence: tf.count / pattern.totalTagged,
      reason: `Based on ${tf.count} ${reasonContext}`,
    }))
    .filter((s) => s.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Merge multiple patterns into a single combined pattern for suggestion generation.
 */
function mergePatterns(patterns: TaggingPattern[]): TaggingPattern {
  const tagMap = new Map<string, number>();
  let totalTagged = 0;

  for (const p of patterns) {
    totalTagged += p.totalTagged;
    for (const tf of p.tags) {
      const key = tf.name.toLowerCase();
      tagMap.set(key, (tagMap.get(key) ?? 0) + tf.count);
    }
  }

  const tags: TagFrequency[] = [];
  for (const [name, count] of tagMap) {
    tags.push({ name, count });
  }

  return {
    counterpartyName: patterns[0]?.counterpartyName ?? '',
    tags,
    totalTagged,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get the pattern data for a specific counterparty.
 *
 * Useful for the "Why?" tooltip in the suggestions UI.
 */
export function getPatternForCounterparty(counterpartyName: string): TaggingPattern | null {
  if (!counterpartyName.trim()) return null;
  const normalised = normaliseCounterparty(counterpartyName);
  const patterns = loadPatterns();
  return patterns.find((p) => p.counterpartyName === normalised) ?? null;
}
