// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RecommendationsFeed } from './RecommendationsFeed';
import type { PersonalizedRecommendation, RecommendationSummary } from '../../lib/recommendations';

const recommendation: PersonalizedRecommendation = {
  id: 'spending-spike-dining',
  title: 'You spent 40% more on dining this month',
  summary: "Returning to last month's pace could save about $200 this month.",
  explanation:
    'Dining is now your largest variable expense, making it the fastest category to trim.',
  category: 'spending',
  priority: 'high',
  score: 88,
  currencyCode: 'USD',
  icon: 'chart-bar',
  tags: ['Dining', 'category spike'],
  actionLabel: 'Review transactions',
  actionHref: '/transactions',
  actionSteps: [
    {
      title: 'Review this category first',
      description: 'Scan the last two weeks of dining purchases for easy wins.',
      href: '/transactions',
    },
    {
      title: 'Set a tighter cap',
      description: "Commit to last month's baseline for the rest of this month.",
      href: '/budgets',
    },
  ],
  evidence: ['This month: $700', 'Last month: $500'],
  impact: {
    monthlySavingsCents: 20_000,
    annualSavingsCents: 240_000,
  },
};

const summary: RecommendationSummary = {
  totalCount: 1,
  criticalCount: 0,
  highCount: 1,
  estimatedMonthlySavingsCents: 20_000,
  lastAnalyzedAt: '2025-05-18T00:00:00Z',
};

describe('RecommendationsFeed', () => {
  it('renders recommendations and opens the detail view', () => {
    render(
      <MemoryRouter>
        <RecommendationsFeed recommendations={[recommendation]} summary={summary} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Recommended next moves')).toBeInTheDocument();
    expect(screen.getByText('You spent 40% more on dining this month')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view plan/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('What the engine saw')).toBeInTheDocument();
    expect(screen.getByText('Review this category first')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders an empty state when no recommendations are available', () => {
    render(
      <MemoryRouter>
        <RecommendationsFeed recommendations={[]} summary={{ ...summary, totalCount: 0 }} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No recommendations yet')).toBeInTheDocument();
  });
});
