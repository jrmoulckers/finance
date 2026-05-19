// SPDX-License-Identifier: BUSL-1.1

/**
 * Tag suggestions component showing confidence-scored recommendations.
 *
 * Displays suggested tags as ghost chips above the tag input, with
 * click-to-accept and dismiss functionality. Includes a "Why?" tooltip
 * explaining the basis for each suggestion.
 *
 * Only renders when the user has enabled "Smart tag suggestions" in settings.
 *
 * @module components/tagging/TagSuggestions
 * References: issue #1473
 */

import { useCallback, useState } from 'react';

import type { TagSuggestion } from '../../lib/tagging/tagging-types';

import './tagging.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for {@link TagSuggestions}. */
export interface TagSuggestionsProps {
  /** Suggested tags to display. */
  readonly suggestions: readonly TagSuggestion[];
  /** Called when the user accepts a suggested tag. */
  readonly onAccept: (tag: string) => void;
  /** Called when the user dismisses a suggested tag. */
  readonly onDismiss: (tag: string) => void;
  /** Whether suggestions are loading. */
  readonly loading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Displays tag suggestions with confidence scores as interactive chips. */
export function TagSuggestions({
  suggestions,
  onAccept,
  onDismiss,
  loading = false,
}: TagSuggestionsProps) {
  const [tooltipTag, setTooltipTag] = useState<string | null>(null);

  const handleAccept = useCallback(
    (tag: string) => {
      onAccept(tag);
    },
    [onAccept],
  );

  const handleDismiss = useCallback(
    (tag: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss(tag);
    },
    [onDismiss],
  );

  const handleToggleTooltip = useCallback((tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTooltipTag((prev) => (prev === tag ? null : tag));
  }, []);

  if (loading) {
    return (
      <div className="tag-suggestions" role="status" aria-label="Loading tag suggestions">
        <span className="tag-suggestions__loading">Finding suggestions…</span>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="tag-suggestions" aria-label="Suggested tags">
      <span className="tag-suggestions__label" id="tag-suggestions-label">
        Suggested tags:
      </span>
      <div className="tag-suggestions__chips" role="list" aria-labelledby="tag-suggestions-label">
        {suggestions.map((suggestion) => {
          const confidencePercent = Math.round(suggestion.confidence * 100);
          return (
            <div key={suggestion.tag} className="tag-suggestion-chip" role="listitem">
              <button
                type="button"
                className="tag-suggestion-chip__accept"
                onClick={() => handleAccept(suggestion.tag)}
                aria-label={`Accept tag: ${suggestion.tag} (${confidencePercent}% confidence)`}
                title={`Click to add "${suggestion.tag}" tag`}
              >
                <span className="tag-suggestion-chip__name">{suggestion.tag}</span>
                <span className="tag-suggestion-chip__confidence">({confidencePercent}%)</span>
              </button>

              <button
                type="button"
                className="tag-suggestion-chip__why"
                onClick={(e) => handleToggleTooltip(suggestion.tag, e)}
                aria-label={`Why suggest ${suggestion.tag}?`}
                aria-expanded={tooltipTag === suggestion.tag}
              >
                ?
              </button>

              <button
                type="button"
                className="tag-suggestion-chip__dismiss"
                onClick={(e) => handleDismiss(suggestion.tag, e)}
                aria-label={`Dismiss suggestion: ${suggestion.tag}`}
              >
                <span aria-hidden="true">✕</span>
              </button>

              {tooltipTag === suggestion.tag && (
                <div className="tag-suggestion-chip__tooltip" role="tooltip" aria-live="polite">
                  {suggestion.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
