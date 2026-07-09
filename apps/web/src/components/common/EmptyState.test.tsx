// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders message text', () => {
    render(<EmptyState title="No transactions yet" description="Add one to get started." />);

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
    expect(screen.getByText('Add one to get started.')).toBeInTheDocument();
  });

  it('renders optional icon and action content', () => {
    render(
      <EmptyState
        title="No accounts"
        icon={<svg data-testid="empty-state-icon" />}
        action={<button type="button">Create account</button>}
      />,
    );

    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('renders the title as an h2 by default', () => {
    render(<EmptyState title="No accounts" />);
    expect(screen.getByRole('heading', { name: 'No accounts' }).tagName).toBe('H2');
  });

  it('honours a custom heading level', () => {
    render(<EmptyState title="No accounts" headingLevel={3} />);
    expect(screen.getByRole('heading', { name: 'No accounts' }).tagName).toBe('H3');
  });
});
