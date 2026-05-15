// SPDX-License-Identifier: BUSL-1.1

import type React from 'react';
import './skeleton.css';

/** Shape variants for the Skeleton placeholder. */
export type SkeletonVariant = 'line' | 'circle' | 'rectangle';

/** Props for the {@link Skeleton} component. */
export interface SkeletonProps {
  /** The shape of the skeleton placeholder. */
  variant?: SkeletonVariant;
  /** Width in CSS units (e.g. '100%', '200px'). Defaults vary by variant. */
  width?: string;
  /** Height in CSS units (e.g. '16px', '40px'). Defaults vary by variant. */
  height?: string;
  /** Border radius override. Defaults are variant-dependent. */
  borderRadius?: string;
  /** Additional CSS class names. */
  className?: string;
  /** Accessible label describing what content is loading. */
  'aria-label'?: string;
}

/**
 * Skeleton placeholder component for content loading states.
 *
 * Renders an animated shimmer block in one of three shapes: line (text),
 * circle (avatar/icon), or rectangle (card/image). Uses design tokens
 * for all visual properties and respects `prefers-reduced-motion`.
 *
 * @example
 * ```tsx
 * <Skeleton variant="line" width="60%" />
 * <Skeleton variant="circle" width="48px" height="48px" />
 * <Skeleton variant="rectangle" width="100%" height="200px" />
 * ```
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'line',
  width,
  height,
  borderRadius,
  className = '',
  'aria-label': ariaLabel = 'Loading content',
}) => {
  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;
  if (borderRadius) style.borderRadius = borderRadius;

  return (
    <div
      className={`skeleton skeleton--${variant} ${className}`.trim()}
      style={style}
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    >
      <span className="skeleton__sr-label">{ariaLabel}</span>
    </div>
  );
};

/* --------------------------------------------------------------------------
 * Page-Specific Composite Skeletons
 * -------------------------------------------------------------------------- */

/** Props shared by all page skeleton composites. */
export interface PageSkeletonProps {
  /** Additional CSS class names. */
  className?: string;
}

/**
 * Skeleton layout mimicking the Accounts page.
 * Shows a header line, summary cards, and a list of account rows.
 */
export const AccountsSkeleton: React.FC<PageSkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton-page skeleton-page--accounts ${className}`.trim()} aria-busy="true">
    <Skeleton variant="line" width="40%" height="24px" aria-label="Loading page title" />
    <div className="skeleton-page__summary">
      <Skeleton variant="rectangle" width="100%" height="80px" aria-label="Loading summary card" />
      <Skeleton variant="rectangle" width="100%" height="80px" aria-label="Loading summary card" />
      <Skeleton variant="rectangle" width="100%" height="80px" aria-label="Loading summary card" />
    </div>
    <div className="skeleton-page__list">
      {Array.from({ length: 4 }, (_, i) => (
        <div className="skeleton-page__row" key={i}>
          <Skeleton variant="circle" width="40px" height="40px" aria-label="Loading account icon" />
          <div className="skeleton-page__row-text">
            <Skeleton variant="line" width="60%" height="16px" aria-label="Loading account name" />
            <Skeleton
              variant="line"
              width="30%"
              height="14px"
              aria-label="Loading account balance"
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Skeleton layout mimicking the Transactions page.
 * Shows filter bar, date group headers, and transaction rows.
 */
export const TransactionsSkeleton: React.FC<PageSkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton-page skeleton-page--transactions ${className}`.trim()} aria-busy="true">
    <Skeleton variant="line" width="40%" height="24px" aria-label="Loading page title" />
    <div className="skeleton-page__filters">
      <Skeleton variant="rectangle" width="120px" height="36px" aria-label="Loading filter" />
      <Skeleton variant="rectangle" width="120px" height="36px" aria-label="Loading filter" />
      <Skeleton variant="rectangle" width="120px" height="36px" aria-label="Loading filter" />
    </div>
    <Skeleton variant="line" width="25%" height="14px" aria-label="Loading date header" />
    <div className="skeleton-page__list">
      {Array.from({ length: 5 }, (_, i) => (
        <div className="skeleton-page__row" key={i}>
          <Skeleton
            variant="circle"
            width="36px"
            height="36px"
            aria-label="Loading category icon"
          />
          <div className="skeleton-page__row-text">
            <Skeleton variant="line" width="50%" height="16px" aria-label="Loading description" />
            <Skeleton variant="line" width="25%" height="14px" aria-label="Loading amount" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Skeleton layout mimicking the Dashboard page.
 * Shows summary cards, a chart placeholder, and recent transactions.
 */
export const DashboardSkeleton: React.FC<PageSkeletonProps> = ({ className = '' }) => (
  <div className={`skeleton-page skeleton-page--dashboard ${className}`.trim()} aria-busy="true">
    <Skeleton variant="line" width="30%" height="28px" aria-label="Loading greeting" />
    <div className="skeleton-page__summary">
      <Skeleton variant="rectangle" width="100%" height="96px" aria-label="Loading balance card" />
      <Skeleton variant="rectangle" width="100%" height="96px" aria-label="Loading income card" />
      <Skeleton variant="rectangle" width="100%" height="96px" aria-label="Loading expense card" />
    </div>
    <Skeleton variant="rectangle" width="100%" height="240px" aria-label="Loading spending chart" />
    <Skeleton variant="line" width="35%" height="20px" aria-label="Loading section title" />
    <div className="skeleton-page__list">
      {Array.from({ length: 3 }, (_, i) => (
        <div className="skeleton-page__row" key={i}>
          <Skeleton variant="circle" width="36px" height="36px" aria-label="Loading icon" />
          <div className="skeleton-page__row-text">
            <Skeleton variant="line" width="55%" height="16px" aria-label="Loading text" />
            <Skeleton variant="line" width="20%" height="14px" aria-label="Loading amount" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Skeleton;
