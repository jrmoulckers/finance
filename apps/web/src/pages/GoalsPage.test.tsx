// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GoalsPage } from './GoalsPage';

describe('GoalsPage', () => {
  it('renders without crashing', () => {
    render(<GoalsPage />);
    expect(screen.getByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument();
  });

  it('displays goals summary', () => {
    render(<GoalsPage />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
  });

  it('displays individual goal names', () => {
    render(<GoalsPage />);
    expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
    expect(screen.getByText('New Laptop')).toBeInTheDocument();
    expect(screen.getByText('Down Payment')).toBeInTheDocument();
  });

  it('has accessible progress bars', () => {
    render(<GoalsPage />);
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(4);
  });
});
