// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import './empty-state.css';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * Heading level for the title, so the empty state slots correctly into the
   * surrounding document outline (WCAG 1.3.1 / heading-order). @default 2
   */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
  headingLevel = 2,
}) => {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={`empty-state ${className}`.trim()} role="status" aria-label={title}>
      {icon && (
        <div className="empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <Heading className="empty-state__title">{title}</Heading>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </section>
  );
};

export default EmptyState;
