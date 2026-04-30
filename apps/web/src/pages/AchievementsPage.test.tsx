// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AchievementsPage } from './AchievementsPage';

vi.mock('../hooks/useGamification', () => ({
  useGamification: vi.fn(),
}));

import { useGamification } from '../hooks/useGamification';
const mockedUseGamification = vi.mocked(useGamification);

const makeState = () => ({
  achievements: [
    {
      id: 'first-transaction',
      name: 'First Step',
      description: 'Log your first transaction',
      icon: '👣',
      category: 'tracking' as const,
      status: 'unlocked' as const,
      progress: 100,
    },
    {
      id: 'transaction-10',
      name: 'Getting Started',
      description: 'Log 10 transactions',
      icon: '📝',
      category: 'tracking' as const,
      status: 'locked' as const,
      progress: 50,
    },
    {
      id: 'first-budget',
      name: 'Budget Beginner',
      description: 'Create your first budget',
      icon: '📋',
      category: 'budgeting' as const,
      status: 'unlocked' as const,
      progress: 100,
    },
    {
      id: 'first-goal',
      name: 'Goal Setter',
      description: 'Create your first savings goal',
      icon: '🎯',
      category: 'saving' as const,
      status: 'locked' as const,
      progress: 0,
    },
    {
      id: 'first-account',
      name: 'Account Opener',
      description: 'Add your first account',
      icon: '🏦',
      category: 'milestone' as const,
      status: 'unlocked' as const,
      progress: 100,
    },
  ],
  streaks: [
    {
      current: 5,
      longest: 12,
      type: 'daily_logging' as const,
      label: 'Daily Logging',
    },
  ],
  milestones: [
    {
      goalId: 'g1',
      goalName: 'Emergency Fund',
      progress: 75,
      milestonesReached: [25, 50, 75],
      nextMilestone: 100,
    },
  ],
  totalPoints: 35,
  level: 1,
  levelName: 'Newcomer',
  pointsToNextLevel: 15,
});

describe('AchievementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner when loading', () => {
    mockedUseGamification.mockReturnValue({
      state: null,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Loading achievements')).toBeInTheDocument();
  });

  it('renders error banner when there is an error', () => {
    mockedUseGamification.mockReturnValue({
      state: null,
      loading: false,
      error: 'Database error',
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Database error')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    mockedUseGamification.mockReturnValue({
      state: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No achievements yet')).toBeInTheDocument();
  });

  it('renders level progress section', () => {
    mockedUseGamification.mockReturnValue({
      state: makeState(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Newcomer')).toBeInTheDocument();
    expect(screen.getByText('35 points earned')).toBeInTheDocument();
    expect(screen.getByText('15 points to next level')).toBeInTheDocument();
  });

  it('renders streak cards', () => {
    mockedUseGamification.mockReturnValue({
      state: makeState(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Streaks')).toBeInTheDocument();
    expect(screen.getByText('Daily Logging')).toBeInTheDocument();
    // "5" appears in both level stats and streak, so query within streak section
    const streakSection = screen.getByLabelText('Daily Logging streak');
    expect(streakSection).toHaveTextContent('5');
    expect(screen.getByText('Best: 12 days')).toBeInTheDocument();
  });

  it('renders goal milestones', () => {
    mockedUseGamification.mockReturnValue({
      state: makeState(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Goal milestones')).toBeInTheDocument();
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Next milestone: 100%')).toBeInTheDocument();
  });

  it('renders achievement badges by category', () => {
    mockedUseGamification.mockReturnValue({
      state: makeState(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Tracking achievements')).toBeInTheDocument();
    expect(screen.getByLabelText('Budgeting achievements')).toBeInTheDocument();
    expect(screen.getByText('First Step')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Budget Beginner')).toBeInTheDocument();
  });

  it('shows unlocked count in stats', () => {
    mockedUseGamification.mockReturnValue({
      state: makeState(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    // 3 unlocked badges
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Badges')).toBeInTheDocument();
  });
});
