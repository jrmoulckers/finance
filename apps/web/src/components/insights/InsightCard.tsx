// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../icons';
import type { GeneratedInsight } from '../../lib/insights';

export interface InsightCardProps {
  insight: GeneratedInsight;
}

export const InsightCard: React.FC<InsightCardProps> = ({ insight }) => {
  return (
    <article className={`insight-card insight-card--${insight.tone}`}>
      <div className="insight-card__icon" aria-hidden="true">
        <AppIcon name={insight.icon} size={18} />
      </div>
      <div className="insight-card__body">
        <h3 className="insight-card__title">{insight.title}</h3>
        <p className="insight-card__description">{insight.description}</p>
        {insight.actionHref && insight.actionLabel ? (
          <Link className="insight-card__action" to={insight.actionHref}>
            {insight.actionLabel}
            <AppIcon name="arrow-right" size={14} />
          </Link>
        ) : null}
      </div>
    </article>
  );
};
