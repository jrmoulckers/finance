// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { CurrencyDisplay } from '../common/CurrencyDisplay';
import type { EmotionalSpendingPattern } from '../../lib/mood';

export interface EmotionalPatternsProps {
  patterns: readonly EmotionalSpendingPattern[];
}

export const EmotionalPatterns: React.FC<EmotionalPatternsProps> = ({ patterns }) => {
  return (
    <section className="mood-patterns" aria-label="Emotional spending patterns">
      <div className="mood-patterns__header">
        <div>
          <h4 className="mood-patterns__title">Detected patterns</h4>
          <p className="mood-patterns__subtitle">
            Insights update automatically as you add more check-ins.
          </p>
        </div>
      </div>

      {patterns.length === 0 ? (
        <p className="mood-patterns__empty">
          No reliable emotional spending patterns yet. A few more check-ins will make the insights
          sharper.
        </p>
      ) : (
        <div className="mood-patterns__list">
          {patterns.map((pattern) => (
            <article key={pattern.id} className="mood-patterns__card">
              <div className="mood-patterns__card-header">
                <div>
                  <h5 className="mood-patterns__card-title">{pattern.title}</h5>
                  <p className="mood-patterns__card-meta">{pattern.summary}</p>
                </div>
                <span
                  className={`mood-patterns__badge mood-patterns__badge--${pattern.confidence}`}
                >
                  {pattern.confidence} confidence
                </span>
              </div>
              <dl className="mood-patterns__stats">
                <div>
                  <dt>Avg spend</dt>
                  <dd>
                    <CurrencyDisplay
                      amount={pattern.averageSpendCents}
                      context="average spend for pattern"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>{pattern.supportingEntries} check-ins</dd>
                </div>
                <div>
                  <dt>Categories</dt>
                  <dd>{pattern.matchedCategories.join(', ') || 'Mixed'}</dd>
                </div>
              </dl>
              <p className="mood-patterns__recommendation">{pattern.recommendation}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default EmotionalPatterns;
