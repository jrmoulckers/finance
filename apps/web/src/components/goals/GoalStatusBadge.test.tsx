// SPDX-License-Identifier: MIT

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GoalStatus } from '../../kmp/bridge';
import { GoalStatusBadge } from './GoalStatusBadge';

describe('GoalStatusBadge', () => {
  it('renders a readable label for each status', () => {
    const cases: Array<[GoalStatus, string]> = [
      ['ACTIVE', 'Active'],
      ['PAUSED', 'Paused'],
      ['COMPLETED', 'Completed'],
      ['CANCELLED', 'Cancelled'],
    ];

    for (const [status, label] of cases) {
      const { unmount } = render(<GoalStatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('applies a tone class and exposes the raw status', () => {
    render(<GoalStatusBadge status="COMPLETED" />);
    const badge = screen.getByText('Completed');
    expect(badge).toHaveClass('goal-status-badge--completed');
    expect(badge).toHaveAttribute('data-status', 'COMPLETED');
  });

  it('merges an extra class name', () => {
    render(<GoalStatusBadge status="ACTIVE" className="extra" />);
    expect(screen.getByText('Active')).toHaveClass('extra');
  });
});
