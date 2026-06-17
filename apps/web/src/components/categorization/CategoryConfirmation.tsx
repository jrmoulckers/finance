// SPDX-License-Identifier: BUSL-1.1

import type { CategorySuggestion } from '../../lib/categorization';
import { AutoCategoryBadge } from './AutoCategoryBadge';

import './categorization.css';

export interface CategoryConfirmationProps {
  suggestion: CategorySuggestion;
  onAccept: () => void;
  onReject: () => void;
}

export function CategoryConfirmation({
  suggestion,
  onAccept,
  onReject,
}: CategoryConfirmationProps) {
  return (
    <div className="category-confirmation" role="group" aria-label="Auto-categorization suggestion">
      <span className="category-confirmation__label">Suggested category</span>
      <AutoCategoryBadge suggestion={suggestion} />
      <div className="category-confirmation__actions">
        <button
          type="button"
          className="category-confirmation__button category-confirmation__button--accept"
          onClick={onAccept}
        >
          Accept
        </button>
        <button type="button" className="category-confirmation__button" onClick={onReject}>
          Reject
        </button>
      </div>
    </div>
  );
}
