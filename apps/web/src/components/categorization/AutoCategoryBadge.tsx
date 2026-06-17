// SPDX-License-Identifier: BUSL-1.1

import type { CategorySuggestion } from '../../lib/categorization';

import './categorization.css';

export interface AutoCategoryBadgeProps {
  suggestion: CategorySuggestion;
}

export function AutoCategoryBadge({ suggestion }: AutoCategoryBadgeProps) {
  return (
    <span
      className={`auto-category-badge auto-category-badge--${suggestion.confidenceLevel}`}
      title={suggestion.reason}
    >
      <span>{suggestion.categoryName}</span>
      <span className="auto-category-badge__confidence">
        {Math.round(suggestion.confidence * 100)}%
      </span>
    </span>
  );
}
