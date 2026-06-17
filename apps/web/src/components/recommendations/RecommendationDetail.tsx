// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link } from 'react-router-dom';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { AppIcon } from '../icons';
import type { PersonalizedRecommendation } from '../../lib/recommendations';

export interface RecommendationDetailProps {
  readonly recommendation: PersonalizedRecommendation | null;
  readonly onClose: () => void;
}

function renderRunwayImpact(recommendation: PersonalizedRecommendation) {
  const impact = recommendation.impact;
  if (!impact) {
    return null;
  }

  if (impact.currentRunwayMonths !== undefined) {
    return (
      <div className="recommendation-detail__metric">
        <span>Emergency runway</span>
        <strong>
          {impact.currentRunwayMonths.toFixed(1)} / {impact.targetRunwayMonths ?? 6} months
        </strong>
      </div>
    );
  }

  if (impact.monthlySavingsCents !== undefined) {
    return (
      <div className="recommendation-detail__metric">
        <span>Monthly opportunity</span>
        <strong>
          <CurrencyDisplay
            amount={impact.monthlySavingsCents}
            currency={recommendation.currencyCode}
            colorize
            showSign
            context="monthly recommendation impact"
          />
        </strong>
      </div>
    );
  }

  return null;
}

export const RecommendationDetail: React.FC<RecommendationDetailProps> = ({
  recommendation,
  onClose,
}) => {
  if (!recommendation) {
    return null;
  }

  return (
    <div className="recommendation-detail__backdrop" role="presentation" onClick={onClose}>
      <section
        className="recommendation-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recommendation-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="recommendation-detail__header">
          <div>
            <p className="recommendation-detail__eyebrow">Personalized recommendation</p>
            <h3 id="recommendation-detail-title">{recommendation.title}</h3>
            <p className="recommendation-detail__summary">{recommendation.summary}</p>
          </div>
          <button
            type="button"
            className="recommendation-detail__close"
            onClick={onClose}
            aria-label={`Close details for ${recommendation.title}`}
          >
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <div className="recommendation-detail__metrics">
          {renderRunwayImpact(recommendation)}
          {recommendation.impact?.annualSavingsCents ? (
            <div className="recommendation-detail__metric">
              <span>12-month impact</span>
              <strong>
                <CurrencyDisplay
                  amount={recommendation.impact.annualSavingsCents}
                  currency={recommendation.currencyCode}
                  colorize
                  showSign
                  context="annual recommendation impact"
                />
              </strong>
            </div>
          ) : null}
          {recommendation.impact?.monthsToTarget !== undefined &&
          recommendation.impact.monthsToTarget !== null ? (
            <div className="recommendation-detail__metric">
              <span>Time to target</span>
              <strong>{recommendation.impact.monthsToTarget} months</strong>
            </div>
          ) : null}
        </div>

        <div className="recommendation-detail__content">
          <div>
            <h4>Why this matters</h4>
            <p>{recommendation.explanation}</p>
          </div>

          {recommendation.evidence.length > 0 ? (
            <div>
              <h4>What the engine saw</h4>
              <ul className="recommendation-detail__list">
                {recommendation.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h4>Action steps</h4>
            <ol className="recommendation-detail__steps">
              {recommendation.actionSteps.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="recommendation-detail__footer">
          {recommendation.actionHref && recommendation.actionLabel ? (
            <Link
              className="recommendation-card__button recommendation-card__button--primary"
              to={recommendation.actionHref}
            >
              {recommendation.actionLabel}
              <AppIcon name="arrow-right" size={14} />
            </Link>
          ) : null}
          <button
            type="button"
            className="recommendation-card__button recommendation-card__button--secondary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
};
