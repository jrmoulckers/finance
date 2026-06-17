// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { Link } from 'react-router-dom';

import { CurrencyDisplay } from '../common';
import { AppIcon, type IconName } from '../icons';
import type {
  SuggestedGoalPriority,
  SuggestedSavingsGoal,
  SuggestedGoalType,
} from '../../lib/savings';

export interface SuggestedGoalsProps {
  readonly suggestions: readonly SuggestedSavingsGoal[];
  readonly currencyCode: string;
  readonly selectedSuggestionId: string | null;
  readonly onSelectSuggestion: (suggestionId: string) => void;
  readonly onAddGoal?: (suggestion: SuggestedSavingsGoal) => void;
}

function getSuggestionIcon(type: SuggestedGoalType): IconName {
  switch (type) {
    case 'emergency-fund':
      return 'shield';
    case 'discretionary-savings':
      return 'wallet';
    case 'big-purchase':
      return 'target';
    case 'retirement':
      return 'trending-up';
    case 'debt-payoff':
      return 'bank';
    default:
      return 'target';
  }
}

function getPriorityTone(priority: SuggestedGoalPriority): { background: string; color: string } {
  switch (priority) {
    case 'high':
      return { background: 'rgba(220, 38, 38, 0.12)', color: '#B91C1C' };
    case 'medium':
      return { background: 'rgba(245, 158, 11, 0.16)', color: '#B45309' };
    default:
      return { background: 'rgba(37, 99, 235, 0.12)', color: '#1D4ED8' };
  }
}

export function SuggestedGoals({
  suggestions,
  currencyCode,
  selectedSuggestionId,
  onSelectSuggestion,
  onAddGoal,
}: SuggestedGoalsProps) {
  return (
    <div
      className="card-grid"
      role="list"
      aria-label="AI suggested savings goals"
      style={{ marginTop: 'var(--spacing-4)' }}
    >
      {suggestions.map((suggestion) => {
        const priorityTone = getPriorityTone(suggestion.priority);
        const isSelected = suggestion.id === selectedSuggestionId;

        return (
          <article
            key={suggestion.id}
            className="card"
            role="listitem"
            style={{
              border: isSelected ? '2px solid var(--color-primary, #2563EB)' : undefined,
              boxShadow: isSelected ? '0 10px 30px rgba(37, 99, 235, 0.12)' : undefined,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--spacing-3)',
                marginBottom: 'var(--spacing-3)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <AppIcon name={getSuggestionIcon(suggestion.type)} />
                  <h3 style={{ margin: 0, fontWeight: 'var(--font-weight-semibold)' }}>
                    {suggestion.title}
                  </h3>
                </div>
                <p
                  style={{
                    marginTop: 'var(--spacing-2)',
                    marginBottom: 0,
                    color: 'var(--semantic-text-secondary)',
                  }}
                >
                  {suggestion.reason}
                </p>
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '999px',
                  fontSize: 'var(--type-scale-caption-font-size)',
                  fontWeight: 700,
                  textTransform: 'capitalize',
                  background: priorityTone.background,
                  color: priorityTone.color,
                }}
              >
                {suggestion.priority}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'var(--spacing-3)',
                marginBottom: 'var(--spacing-3)',
              }}
            >
              <div>
                <p className="card__title">Current</p>
                <p className="card__value">
                  <CurrencyDisplay amount={suggestion.currentCents} currency={currencyCode} />
                </p>
              </div>
              <div>
                <p className="card__title">Target</p>
                <p className="card__value">
                  <CurrencyDisplay amount={suggestion.targetCents} currency={currencyCode} />
                </p>
              </div>
            </div>

            <p style={{ marginBottom: 'var(--spacing-2)', fontWeight: 600 }}>
              Recommended per month:{' '}
              <CurrencyDisplay
                amount={suggestion.contributionPlan.recommendedMonthlyContributionCents}
                currency={currencyCode}
              />
            </p>

            <ul style={{ paddingLeft: '1.1rem', marginTop: 0, marginBottom: 'var(--spacing-4)' }}>
              {suggestion.reasoning.map((reason) => (
                <li
                  key={reason}
                  style={{ marginBottom: '0.35rem', color: 'var(--semantic-text-secondary)' }}
                >
                  {reason}
                </li>
              ))}
            </ul>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--spacing-3)',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className={`form-button ${isSelected ? 'form-button--primary' : 'form-button--secondary'}`}
                onClick={() => onSelectSuggestion(suggestion.id)}
                aria-pressed={isSelected}
              >
                {isSelected ? 'Planner open' : 'Open planner'}
              </button>
              {suggestion.linkedGoalId !== null ? (
                <Link
                  to={`/goals/${suggestion.linkedGoalId}`}
                  className="form-button form-button--secondary"
                >
                  Open goal
                </Link>
              ) : onAddGoal ? (
                <button
                  type="button"
                  className="form-button form-button--secondary"
                  onClick={() => onAddGoal(suggestion)}
                >
                  Add to goals
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default SuggestedGoals;
