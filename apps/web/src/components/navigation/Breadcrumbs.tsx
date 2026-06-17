// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useMemo, useState, type FC } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  getBreadcrumbTrail,
  isMuscleMemoryRoute,
  recordNavigationEntry,
} from '../../lib/navigation/history';
import './breadcrumb.css';

export interface BreadcrumbsProps {
  currentPath: string;
  currentTitle: string;
  maxItems?: number;
}

export const Breadcrumbs: FC<BreadcrumbsProps> = ({ currentPath, currentTitle, maxItems }) => {
  const location = useLocation();
  const [segments, setSegments] = useState(() =>
    getBreadcrumbTrail(currentPath, currentTitle, location.key, maxItems),
  );

  useEffect(() => {
    recordNavigationEntry({
      path: currentPath,
      title: currentTitle,
      key: location.key,
      visitedAt: Date.now(),
    });
    setSegments(getBreadcrumbTrail(currentPath, currentTitle, location.key, maxItems));
  }, [currentPath, currentTitle, location.key, maxItems]);

  const breadcrumbSegments = useMemo(
    () => segments.slice(-Math.max(maxItems ?? 4, 1)),
    [maxItems, segments],
  );

  if (breadcrumbSegments.length <= 1) {
    return null;
  }

  const parentSegments = breadcrumbSegments.slice(0, -1);
  const currentSegment = breadcrumbSegments[breadcrumbSegments.length - 1];

  return (
    <nav className="breadcrumb breadcrumb--history" aria-label="Recent navigation">
      <ol className="breadcrumb__list">
        {parentSegments.map((segment) => {
          const isFrequent = isMuscleMemoryRoute(segment.path);
          return (
            <li key={segment.key} className="breadcrumb__item">
              <Link to={segment.path} className="breadcrumb__link">
                {segment.title}
                {isFrequent ? <span className="breadcrumb__badge">•</span> : null}
              </Link>
              <span className="breadcrumb__separator" aria-hidden="true">
                ›
              </span>
            </li>
          );
        })}
        <li className="breadcrumb__item breadcrumb__item--current" aria-current="page">
          <span className="breadcrumb__current">{currentSegment.title}</span>
        </li>
      </ol>
    </nav>
  );
};
