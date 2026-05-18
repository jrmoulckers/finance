// SPDX-License-Identifier: BUSL-1.1

/**
 * TagList component — renders multiple Tag chips in a flex-wrap layout.
 *
 * Supports overflow handling: shows first N tags + "+X more" chip that
 * expands on click to reveal all tags. Uses role="list" for accessibility.
 */

import React, { useCallback, useState } from 'react';

import { Tag } from './Tag';
import type { TagProps } from './Tag';

/** Props for the TagList component. */
export interface TagListProps {
  /** Array of tag name strings to display. */
  tags: readonly string[];
  /** Maximum number of visible tags before overflow. Defaults to 3. */
  maxVisible?: number;
  /** Size variant passed to each Tag chip. */
  size?: TagProps['size'];
  /** Whether tags are removable. */
  removable?: boolean;
  /** Called when a tag's remove button is clicked. */
  onRemove?: (name: string) => void;
  /** Called when a tag chip is clicked. */
  onTagClick?: (name: string) => void;
  /** Optional class name for the list container. */
  className?: string;
}

/**
 * Renders a list of colored tag chips with optional overflow truncation.
 *
 * When `tags.length > maxVisible`, shows the first `maxVisible` tags
 * and a "+N more" button. Clicking the button expands to show all tags.
 */
export const TagList: React.FC<TagListProps> = ({
  tags,
  maxVisible = 3,
  size = 'sm',
  removable = false,
  onRemove,
  onTagClick,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  if (tags.length === 0) {
    return null;
  }

  const visibleTags = expanded ? tags : tags.slice(0, maxVisible);
  const overflowCount = tags.length - maxVisible;
  const showOverflow = !expanded && overflowCount > 0;

  return (
    <ul className={`tag-list${className ? ` ${className}` : ''}`} role="list" aria-label="Tags">
      {visibleTags.map((tag) => (
        <li key={tag} role="listitem">
          <Tag
            name={tag}
            size={size}
            removable={removable}
            onRemove={onRemove}
            onClick={onTagClick}
          />
        </li>
      ))}
      {showOverflow && (
        <li role="listitem">
          <button
            type="button"
            className="tag-list__overflow"
            onClick={handleExpand}
            aria-label={`Show ${overflowCount} more tag${overflowCount > 1 ? 's' : ''}`}
          >
            +{overflowCount} more
          </button>
        </li>
      )}
    </ul>
  );
};
