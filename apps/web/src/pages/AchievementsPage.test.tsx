// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AchievementsPage } from './AchievementsPage';
import type { GamificationState } from '../components/gamification/achievements-engine';

vi.mock('../hooks/useGamification', () => ({
  useGamification: vi.fn(),
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useGamification } from '../hooks/useGamification';
import { useReducedMotion } from '../hooks/useReducedMotion';
const mockedUseGamification = vi.mocked(useGamification);
const mockedUseReducedMotion = vi.mocked(useReducedMotion);

const makeState = (): GamificationState => ({
  achievements: [
    {
      id: 'first-transaction',
      name: 'First Step',
      description: 'Log your first transaction',
      icon: 'account',
      category: 'tracking' as const,
      status: 'unlocked' as const,
      progress: 100,
    },
    {
      id: 'transaction-10',
      name: 'Getting Started',
      description: 'Log 10 transactions',
      icon: 'edit',
      category: 'tracking' as const,
      status: 'locked' as const,
      progress: 50,
    },
    {
      id: 'first-budget',
      name: 'Budget Beginner',
      description: 'Create your first budget',
      icon: 'clipboard',
      category: 'budgeting' as const,
      status: 'unlocked' as const,
      progress: 100,
    },
    {
      id: 'first-goal',
      name: 'Goal Setter',
      description: 'Create your first savings goal',
      icon: 'target',
      category: 'saving' as const,
      status: 'locked' as const,
      progress: 0,
    },
    {
      id: 'first-account',
      name: 'Account Opener',
      description: 'Add your first account',
      icon: 'bank',
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
  loggedToday: true,
});

describe('AchievementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedUseReducedMotion.mockReturnValue(false);
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

  // -------------------------------------------------------------------------
  // Near-win cues (Refs #2211)
  // -------------------------------------------------------------------------

  const makeNearWinState = (): GamificationState => ({
    ...makeState(),
    loggedToday: false,
    streaks: [{ current: 5, longest: 12, type: 'daily_logging', label: 'Daily Logging' }],
    milestones: [
      {
        goalId: 'g1',
        goalName: 'Car Fund',
        progress: 40,
        milestonesReached: [25],
        nextMilestone: 50,
      },
    ],
    achievements: [
      {
        id: 'transaction-10',
        name: 'Getting Started',
        description: 'Log 10 transactions',
        icon: 'edit',
        category: 'tracking',
        status: 'locked',
        progress: 80,
        nearWin: { remaining: 2, unit: 'check-in', format: 'count' },
      },
    ],
  });

  it('renders near-win cards with a keep-going section and progress semantics', () => {
    mockedUseGamification.mockReturnValue({
      state: makeNearWinState(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AchievementsPage />
      </MemoryRouter>,
    );

    const nextUp = screen.getByRole('region', { name: 'Next up' });
    expect(within(nextUp).getByText('Keep going')).toBeInTheDocument();

    // Streak keep-alive cue (today still pending)
    expect(
      within(nextUp).getByText('Log today to keep your 5-day daily logging streak alive.'),
    ).toBeInTheDocument();

    // Goal near-win cue framed as one more contribution
    expect(
      within(nextUp).getByText("You're 10% away. One more contribution to hit 50% on Car Fund."),
    ).toBeInTheDocument();

    // Badge near-win cue with correct "N more" math
    expect(
      within(nextUp).getByText('2 more check-ins to earn Getting Started.'),
    ).toBeInTheDocument();

    // Progress toward the next win is exposed via accessible progressbar semantics
    const progressBars = within(nextUp).getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(0);
    expect(progressBars[0]).toHaveAttribute('aria-valuenow');
  });

  // -------------------------------------------------------------------------
  // Celebration moments (Refs #2211)
  // -------------------------------------------------------------------------

  const SEEN_STORAGE_KEY = ['finance', 'achievements', 'seen-badges'].join(':');

  it('celebrates a freshly-unlocked badge with an accessible live region', async () => {
    // Pre-seed the "seen" set as empty (non-null) so every unlocked badge reads
    // as newly unlocked — simulating a fresh unlock since the last visit.
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([]));

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

    const celebration = await screen.findByRole('status');
    expect(celebration).toHaveAttribute('aria-live', 'polite');
    // Text (not motion/colour) carries the message
    expect(within(celebration).getByText(/Badge unlocked/)).toBeInTheDocument();
    expect(within(celebration).getByText('First Step')).toBeInTheDocument();
    // Dismiss control is keyboard reachable
    expect(
      within(celebration).getByRole('button', { name: /Dismiss .* celebration/ }),
    ).toBeInTheDocument();
    // Confetti renders when motion is allowed
    expect(within(celebration).queryByTestId('celebration-confetti')).toBeInTheDocument();
  });

  it('does not celebrate pre-existing badges on the first visit', () => {
    // No stored "seen" set -> first visit only seeds, never celebrates.
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

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('falls back to a static celebration (no confetti) when motion is reduced', async () => {
    mockedUseReducedMotion.mockReturnValue(true);
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([]));

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

    const celebration = await screen.findByRole('status');
    // Static congratulatory text is still present...
    expect(within(celebration).getByText(/Badge unlocked/)).toBeInTheDocument();
    expect(within(celebration).getByText('First Step')).toBeInTheDocument();
    // ...but the animated confetti layer is omitted entirely.
    expect(within(celebration).queryByTestId('celebration-confetti')).not.toBeInTheDocument();
  });
});
