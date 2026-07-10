// SPDX-License-Identifier: BUSL-1.1

import type React from 'react';
import { Button } from './Button';
import { EmptyState, type EmptyStateProps } from './EmptyState';

/** Default magnifier-with-slash glyph for a "no matches" state. */
const SearchIcon: React.FC = () => (
  <svg width="56" height="56" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <circle cx="28" cy="28" r="16" stroke="currentColor" strokeWidth="2" />
    <line
      x1="40"
      y1="40"
      x2="52"
      y2="52"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <line
      x1="20"
      y1="36"
      x2="36"
      y2="20"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/** Props for {@link NoResultsEmptyState}. */
export interface NoResultsEmptyStateProps {
  /** Heading text. @default 'No matches found' */
  title?: string;
  /** Supporting guidance. @default 'Try adjusting your search or filters.' */
  description?: string;
  /**
   * Called when the user activates the clear-filters affordance. When omitted,
   * no clear-filters button is rendered.
   */
  onClearFilters?: () => void;
  /** Label for the clear-filters button. @default 'Clear filters' */
  clearLabel?: string;
  /** Optional decorative icon override. */
  icon?: React.ReactNode;
  /** Heading level for correct document outline. @default 2 */
  headingLevel?: EmptyStateProps['headingLevel'];
  /** Additional CSS class names. */
  className?: string;
}

/**
 * Empty state for a filtered or searched list that currently matches nothing.
 *
 * Distinct from a zero-data ("Add your first…") empty state: it tells the user
 * their query/filters excluded everything and offers a one-click way to clear
 * them. Built on top of {@link EmptyState}, so it inherits the same
 * `role="status"` announcement and heading-order semantics.
 *
 * @example
 * ```tsx
 * <NoResultsEmptyState onClearFilters={resetFilters} />
 * ```
 */
export const NoResultsEmptyState: React.FC<NoResultsEmptyStateProps> = ({
  title = 'No matches found',
  description = 'Try adjusting your search or filters.',
  onClearFilters,
  clearLabel = 'Clear filters',
  icon,
  headingLevel = 2,
  className,
}) => (
  <EmptyState
    icon={icon ?? <SearchIcon />}
    title={title}
    description={description}
    headingLevel={headingLevel}
    className={className}
    action={
      onClearFilters ? (
        <Button variant="secondary" onClick={onClearFilters}>
          {clearLabel}
        </Button>
      ) : undefined
    }
  />
);

export default NoResultsEmptyState;
