// SPDX-License-Identifier: BUSL-1.1

import type React from 'react';

import { Skeleton, type PageSkeletonProps } from './Skeleton';

import './entity-skeletons.css';

/* --------------------------------------------------------------------------
 * Additional page-specific composite skeletons
 *
 * Extends the Accounts / Transactions / Dashboard composites in `Skeleton.tsx`
 * to cover the remaining primary entity pages, keeping loading UX consistent
 * app-wide. Each composite reuses the `Skeleton` primitive (which already
 * respects `prefers-reduced-motion`) and sets `aria-busy`.
 * -------------------------------------------------------------------------- */

/** Props for the {@link ListSkeleton} generic composite. */
export interface ListSkeletonProps extends PageSkeletonProps {
  /** Number of placeholder rows to render. @default 5 */
  rows?: number;
  /** Accessible label describing what is loading. @default 'Loading list' */
  'aria-label'?: string;
}

/**
 * Generic list skeleton for any entity page that renders a title and a list of
 * rows. Use when a bespoke composite is unnecessary.
 */
export const ListSkeleton: React.FC<ListSkeletonProps> = ({
  className = '',
  rows = 5,
  'aria-label': ariaLabel = 'Loading list',
}) => (
  <div
    className={`skeleton-page skeleton-page--list ${className}`.trim()}
    role="status"
    aria-busy="true"
    aria-label={ariaLabel}
  >
    <Skeleton variant="line" width="40%" height="24px" aria-label="Loading page title" />
    <div className="skeleton-page__list">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-page__row" key={i}>
          <Skeleton variant="circle" width="36px" height="36px" aria-label="Loading icon" />
          <div className="skeleton-page__row-text">
            <Skeleton variant="line" width="55%" height="16px" aria-label="Loading title" />
            <Skeleton variant="line" width="25%" height="14px" aria-label="Loading detail" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Skeleton layout mimicking the Budgets page.
 * Shows a header line, summary cards, and a list of budget rows each with a
 * progress-bar placeholder.
 */
export const BudgetsSkeleton: React.FC<PageSkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton-page skeleton-page--budgets ${className}`.trim()} aria-busy="true">
    <Skeleton variant="line" width="35%" height="24px" aria-label="Loading page title" />
    <div className="skeleton-page__summary">
      <Skeleton
        variant="rectangle"
        width="100%"
        height="80px"
        aria-label="Loading budget summary"
      />
      <Skeleton
        variant="rectangle"
        width="100%"
        height="80px"
        aria-label="Loading budget summary"
      />
    </div>
    <div className="skeleton-page__list">
      {Array.from({ length: 4 }, (_, i) => (
        <div className="skeleton-page__row" key={i}>
          <Skeleton
            variant="circle"
            width="36px"
            height="36px"
            aria-label="Loading category icon"
          />
          <div className="skeleton-page__row-text">
            <Skeleton variant="line" width="45%" height="16px" aria-label="Loading budget name" />
            <Skeleton
              variant="rectangle"
              width="100%"
              height="8px"
              borderRadius="9999px"
              aria-label="Loading budget progress"
            />
          </div>
          <Skeleton variant="line" width="15%" height="14px" aria-label="Loading budget amount" />
        </div>
      ))}
    </div>
  </div>
);

/**
 * Skeleton layout mimicking the Goals page.
 * Shows a header line and a grid of goal cards, each with a progress ring
 * placeholder and supporting text lines.
 */
export const GoalsSkeleton: React.FC<PageSkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton-page skeleton-page--goals ${className}`.trim()} aria-busy="true">
    <Skeleton variant="line" width="30%" height="24px" aria-label="Loading page title" />
    <div className="skeleton-page__grid">
      {Array.from({ length: 4 }, (_, i) => (
        <div className="skeleton-page__card" key={i}>
          <Skeleton
            variant="circle"
            width="56px"
            height="56px"
            aria-label="Loading goal progress"
          />
          <Skeleton variant="line" width="70%" height="16px" aria-label="Loading goal name" />
          <Skeleton variant="line" width="45%" height="14px" aria-label="Loading goal target" />
          <Skeleton
            variant="rectangle"
            width="100%"
            height="8px"
            borderRadius="9999px"
            aria-label="Loading goal progress bar"
          />
        </div>
      ))}
    </div>
  </div>
);
