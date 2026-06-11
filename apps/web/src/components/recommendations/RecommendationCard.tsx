// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link } from 'react-router-dom';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { AppIcon } from '../icons';
import type { PersonalizedRecommendation } from '../../lib/recommendations';

export interface RecommendationCardProps {
  readonly recommendation: PersonalizedRecommendation;
  readonly onOpen: (recommendation: PersonalizedRecommendation) => void;
}

function getPriorityLabel(priority: PersonalizedRecommendation['priority']): string {
  switch (priority) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High priority';
    case 'medium':
      return 'Medium priority';
    case 'low':
    default:
      return 'Low priority';
  }
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  onOpen,
}) => {
  return (
    <article
      className={`recommendation-card recommendation-card--${recommendation.priority}`}
      aria-label={recommendation.title}
    >
      <div className="recommendation-card__header">
        <div className="recommendation-card__priority-group">
          <span
            className={`recommendation-card__priority recommendation-card__priority--${recommendation.priority}`}
          >
            {getPriorityLabel(recommendation.priority)}
          </span>
          <span className="recommendation-card__score">Score {recommendation.score}</span>
        </div>
        <div className="recommendation-card__icon" aria-hidden="true">
          <AppIcon name={recommendation.icon} size={18} />
        </div>
      </div>

      <div className="recommendation-card__body">
        <h3 className="recommendation-card__title">{recommendation.title}</h3>
        <p className="recommendation-card__summary">{recommendation.summary}</p>
        {recommendation.impact?.monthlySavingsCents ? (
          <p className="recommendation-card__impact">
            Potential monthly lift{' '}
            <CurrencyDisplay
              amount={recommendation.impact.monthlySavingsCents}
              currency={recommendation.currencyCode}
              colorize
              showSign
              context="potential monthly savings"
            />
          </p>
        ) : null}
        <div className="recommendation-card__tags" role="list" aria-label="Recommendation tags">
          {recommendation.tags.map((tag) => (
            <span key={tag} className="recommendation-card__tag" role="listitem">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="recommendation-card__actions">
        <button
          type="button"
          className="recommendation-card__button recommendation-card__button--primary"
          onClick={() => onOpen(recommendation)}
        >
          View plan
        </button>
        {recommendation.actionHref && recommendation.actionLabel ? (
          <Link
            className="recommendation-card__button recommendation-card__button--link"
            to={recommendation.actionHref}
          >
            {recommendation.actionLabel}
            <AppIcon name="arrow-right" size={14} />
          </Link>
        ) : null}
      </div>
    </article>
  );
};
