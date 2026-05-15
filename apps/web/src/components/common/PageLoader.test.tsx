// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PageLoader } from './PageLoader';

describe('PageLoader', () => {
  it('renders children in loaded state', () => {
    render(
      <PageLoader state="loaded">
        <p>Page content</p>
      </PageLoader>,
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('does not render children when loading', () => {
    render(
      <PageLoader state="loading">
        <p>Page content</p>
      </PageLoader>,
    );
    expect(screen.queryByText('Page content')).not.toBeInTheDocument();
  });

  it('renders default skeleton during loading', () => {
    const { container } = render(
      <PageLoader state="loading">
        <p>Content</p>
      </PageLoader>,
    );
    expect(container.querySelector('.page-loader__default-skeleton')).toBeInTheDocument();
  });

  it('renders custom skeleton when provided', () => {
    render(
      <PageLoader state="loading" skeleton={<div data-testid="custom-skeleton">Loading...</div>}>
        <p>Content</p>
      </PageLoader>,
    );
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
  });

  it('sets aria-busy=true during loading', () => {
    const { container } = render(
      <PageLoader state="loading">
        <p>Content</p>
      </PageLoader>,
    );
    expect(container.querySelector('.page-loader')).toHaveAttribute('aria-busy', 'true');
  });

  it('sets aria-busy=false when loaded', () => {
    const { container } = render(
      <PageLoader state="loaded">
        <p>Content</p>
      </PageLoader>,
    );
    expect(container.querySelector('.page-loader')).toHaveAttribute('aria-busy', 'false');
  });

  it('renders error banner with retry in error state', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <PageLoader state="error" errorMessage="Network error" onRetry={onRetry}>
        <p>Content</p>
      </PageLoader>,
    );

    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders default empty state in empty state', () => {
    render(
      <PageLoader state="empty">
        <p>Content</p>
      </PageLoader>,
    );
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('renders custom empty state props', () => {
    render(
      <PageLoader
        state="empty"
        emptyStateProps={{
          title: 'No accounts',
          description: 'Create your first account to get started.',
        }}
      >
        <p>Content</p>
      </PageLoader>,
    );
    expect(screen.getByText('No accounts')).toBeInTheDocument();
    expect(screen.getByText('Create your first account to get started.')).toBeInTheDocument();
  });

  it('has aria-live=polite for screen reader state transitions', () => {
    const { container } = render(
      <PageLoader state="loaded">
        <p>Content</p>
      </PageLoader>,
    );
    expect(container.querySelector('.page-loader')).toHaveAttribute('aria-live', 'polite');
  });
});
