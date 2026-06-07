// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { MilestoneCelebration, type MilestoneCelebrationProps } from './MilestoneCelebration';

import type { Milestone } from '../../hooks/useMilestones';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseMilestone: Milestone = {
  type: 'first-transaction',
  title: 'First Transaction!',
  description: 'You logged your first transaction. Great start!',
  icon: 'sparkles',
};

function renderCelebration(overrides: Partial<MilestoneCelebrationProps> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn();
  const onDismissPermanently = overrides.onDismissPermanently ?? vi.fn();

  render(
    <MilestoneCelebration
      milestone={baseMilestone}
      onDismiss={onDismiss}
      onDismissPermanently={onDismissPermanently}
      {...overrides}
    />,
  );

  return { onDismiss, onDismissPermanently };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MilestoneCelebration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders milestone title and description', () => {
    renderCelebration();

    expect(screen.getByText('First Transaction!')).toBeInTheDocument();
    expect(screen.getByText('You logged your first transaction. Great start!')).toBeInTheDocument();
  });

  it('renders the milestone icon', () => {
    renderCelebration();

    expect(document.querySelector('.milestone-celebration__icon svg')).toBeInTheDocument();
  });

  it('renders each milestone type correctly', () => {
    const types: Milestone[] = [
      {
        type: 'goal-50',
        title: 'Halfway!',
        description: "You're at 50% of your savings goal!",
        icon: 'sparkles',
      },
      {
        type: 'streak-7',
        title: '7-Day Streak!',
        description: 'A whole week of consistent logging!',
        icon: 'calendar',
      },
      {
        type: 'goal-100',
        title: 'Goal Achieved!',
        description: 'Congratulations! You reached your savings goal!',
        icon: 'trophy',
      },
    ];

    for (const milestone of types) {
      const { unmount } = render(
        <MilestoneCelebration
          milestone={milestone}
          onDismiss={vi.fn()}
          onDismissPermanently={vi.fn()}
        />,
      );

      expect(screen.getByText(milestone.title)).toBeInTheDocument();
      expect(screen.getByText(milestone.description)).toBeInTheDocument();
      unmount();
    }
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    const { onDismiss } = renderCelebration();

    fireEvent.click(screen.getByTestId('milestone-dismiss'));

    expect(onDismiss).toHaveBeenCalledWith('first-transaction');
  });

  it('calls onDismissPermanently when "Don\'t show again" is clicked', () => {
    const { onDismissPermanently } = renderCelebration();

    fireEvent.click(screen.getByTestId('milestone-dont-show'));

    expect(onDismissPermanently).toHaveBeenCalledWith('first-transaction');
  });

  it('applies static class when reduced motion is preferred', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    renderCelebration();

    const element = screen.getByTestId('milestone-celebration');
    expect(element.className).toContain('milestone-celebration--static');
  });

  it('does not apply static class when motion is allowed', () => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
    renderCelebration();

    const element = screen.getByTestId('milestone-celebration');
    expect(element.className).not.toContain('milestone-celebration--static');
  });

  it('has aria-live for screen reader announcement', () => {
    renderCelebration();

    const element = screen.getByTestId('milestone-celebration');
    expect(element).toHaveAttribute('aria-live', 'polite');
    expect(element).toHaveAttribute('role', 'status');
  });

  it('dismisses on Escape key', () => {
    const { onDismiss } = renderCelebration();

    const element = screen.getByTestId('milestone-celebration');
    fireEvent.keyDown(element, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledWith('first-transaction');
  });
});
