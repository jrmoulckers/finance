// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for tag suggestions based on pattern learning (Phase 2).
 *
 * Provides confidence-scored tag suggestions for transactions based on
 * historical tagging patterns, and records new tagging actions to
 * improve future suggestions.
 *
 * @module hooks/useTagSuggestions
 * References: issue #1473
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Transaction } from '../kmp/bridge';
import { clearPatterns, getSuggestedTags, recordTagging } from '../lib/tagging/pattern-tracker';
import type { AutoTaggingSettings, TagSuggestion } from '../lib/tagging/tagging-types';
import { DEFAULT_AUTO_TAGGING_SETTINGS } from '../lib/tagging/tagging-types';

// ---------------------------------------------------------------------------
// Settings storage
// ---------------------------------------------------------------------------

const SETTINGS_STORAGE_KEY = 'finance-auto-tagging-settings';

/** Load auto-tagging settings from localStorage. */
function loadSettings(): AutoTaggingSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AUTO_TAGGING_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AutoTaggingSettings>;
    return {
      rulesEnabled: typeof parsed.rulesEnabled === 'boolean' ? parsed.rulesEnabled : false,
      suggestionsEnabled:
        typeof parsed.suggestionsEnabled === 'boolean' ? parsed.suggestionsEnabled : false,
    };
  } catch {
    return DEFAULT_AUTO_TAGGING_SETTINGS;
  }
}

/** Persist auto-tagging settings to localStorage. */
function saveSettings(settings: AutoTaggingSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result returned by {@link useTagSuggestions}. */
export interface UseTagSuggestionsResult {
  /** Suggested tags for the current transaction, sorted by confidence. */
  readonly suggestions: TagSuggestion[];
  /** Whether suggestions are loading. */
  readonly loading: boolean;
  /** Current auto-tagging settings. */
  readonly settings: AutoTaggingSettings;
  /** Update auto-tagging settings. */
  readonly updateSettings: (updates: Partial<AutoTaggingSettings>) => void;
  /** Record that the user applied tags to a transaction (for learning). */
  readonly recordUserTagging: (counterpartyName: string, tags: readonly string[]) => void;
  /** Accept a suggested tag (records the acceptance for learning). */
  readonly acceptSuggestion: (tag: string) => void;
  /** Dismiss a suggestion (currently no-op; could track dismissals later). */
  readonly dismissSuggestion: (tag: string) => void;
  /** Clear all learned patterns. */
  readonly resetPatterns: () => void;
  /** Refresh suggestions for the current transaction. */
  readonly refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for tag suggestions based on pattern learning.
 *
 * Pass a transaction to get suggestions based on its payee and other
 * attributes. The hook only generates suggestions when the user has
 * enabled "Smart tag suggestions" in settings.
 *
 * @param transaction - The transaction to generate suggestions for (or null)
 */
export function useTagSuggestions(transaction: Transaction | null): UseTagSuggestionsResult {
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AutoTaggingSettings>(DEFAULT_AUTO_TAGGING_SETTINGS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [refreshToken, setRefreshToken] = useState(0);

  // Load settings on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  // Generate suggestions when transaction or settings change
  useEffect(() => {
    if (!transaction || !settings.suggestionsEnabled) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const raw = getSuggestedTags(transaction);
      // Filter out dismissed suggestions
      const filtered = raw.filter((s) => !dismissed.has(s.tag.toLowerCase()));
      setSuggestions(filtered);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [transaction, settings.suggestionsEnabled, dismissed, refreshToken]);

  const updateSettings = useCallback((updates: Partial<AutoTaggingSettings>): void => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  const recordUserTagging = useCallback(
    (counterpartyName: string, tags: readonly string[]): void => {
      if (!settings.suggestionsEnabled) return;
      recordTagging(counterpartyName, tags);
    },
    [settings.suggestionsEnabled],
  );

  const acceptSuggestion = useCallback(
    (tag: string): void => {
      if (transaction?.payee) {
        recordTagging(transaction.payee, [tag]);
        refresh();
      }
    },
    [transaction, refresh],
  );

  const dismissSuggestion = useCallback((tag: string): void => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(tag.toLowerCase());
      return next;
    });
  }, []);

  const resetPatterns = useCallback((): void => {
    clearPatterns();
    setSuggestions([]);
  }, []);

  // Memoize the return object to avoid unnecessary re-renders in consumers
  return useMemo(
    () => ({
      suggestions,
      loading,
      settings,
      updateSettings,
      recordUserTagging,
      acceptSuggestion,
      dismissSuggestion,
      resetPatterns,
      refresh,
    }),
    [
      suggestions,
      loading,
      settings,
      updateSettings,
      recordUserTagging,
      acceptSuggestion,
      dismissSuggestion,
      resetPatterns,
      refresh,
    ],
  );
}
