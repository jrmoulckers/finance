// SPDX-License-Identifier: BUSL-1.1

/**
 * Tag chip/pill component with deterministic color coding.
 *
 * Displays a colored chip for a tag name. Supports subtag display
 * (e.g., "travel:flights" renders as "travel › flights"), optional
 * remove button for edit mode, and click handling for filtering.
 *
 * Colors are auto-generated from the tag name hash to be visually
 * distinct and WCAG AA contrast compliant.
 */

import React, { useMemo } from 'react';

import { formatTagDisplay, getTagColor, getTagColorDark } from './tag-colors';

/** Props for the Tag component. */
export interface TagProps {
  /** Full tag name, may include subtag separator (e.g., "travel:flights"). */
  name: string;
  /** Size variant: sm for list views, md for detail/forms. */
  size?: 'sm' | 'md';
  /** Whether the tag is removable (shows × button). */
  removable?: boolean;
  /** Callback when remove button is clicked. */
  onRemove?: (name: string) => void;
  /** Callback when the tag chip is clicked (e.g., for filtering). */
  onClick?: (name: string) => void;
  /** Optional emoji or icon prefix to display before the label. */
  icon?: string;
}

/**
 * A colored chip/pill displaying a tag name with optional subtag hierarchy.
 *
 * Accessible as a list item when rendered inside TagList.
 * Clickable tags use a button role; static tags use a span.
 */
export const Tag: React.FC<TagProps> = ({
  name,
  size = 'md',
  removable = false,
  onRemove,
  onClick,
  icon,
}) => {
  const { root, sub } = useMemo(() => formatTagDisplay(name), [name]);
  const lightColor = useMemo(() => getTagColor(name), [name]);
  const darkColor = useMemo(() => getTagColorDark(name), [name]);

  const style = {
    '--tag-bg': lightColor.bg,
    '--tag-text': lightColor.text,
    '--tag-border': lightColor.border,
    '--tag-bg-dark': darkColor.bg,
    '--tag-text-dark': darkColor.text,
    '--tag-border-dark': darkColor.border,
    backgroundColor: 'var(--tag-bg-resolved, var(--tag-bg))',
    color: 'var(--tag-text-resolved, var(--tag-text))',
    borderColor: 'var(--tag-border-resolved, var(--tag-border))',
  } as React.CSSProperties;

  const className = `tag tag--${size}${onClick ? ' tag--clickable' : ''}`;

  const labelContent = (
    <>
      {icon && (
        <span className="tag__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="tag__label">
        {sub ? (
          <>
            {root}
            <span className="tag__separator" aria-hidden="true">
              ›
            </span>
            {sub}
          </>
        ) : (
          root
        )}
      </span>
    </>
  );

  const removeButton = removable && (
    <button
      type="button"
      className="tag__remove"
      onClick={(e) => {
        e.stopPropagation();
        onRemove?.(name);
      }}
      aria-label={`Remove tag ${name}`}
    >
      ×
    </button>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={() => onClick(name)}
        aria-label={`Filter by tag ${name}`}
      >
        {labelContent}
        {removeButton}
      </button>
    );
  }

  return (
    <span className={className} style={style} role="listitem">
      {labelContent}
      {removeButton}
    </span>
  );
};
