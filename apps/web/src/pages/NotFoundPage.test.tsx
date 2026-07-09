// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NotFoundPage } from './NotFoundPage';

function renderNotFoundPage() {
  return render(
    <MemoryRouter>
      <NotFoundPage />
    </MemoryRouter>,
  );
}

describe('NotFoundPage', () => {
  it('renders the not-found heading', () => {
    renderNotFoundPage();

    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
  });

  it('renders the descriptive message', () => {
    renderNotFoundPage();

    expect(screen.getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
  });

  it('renders a link to the dashboard', () => {
    renderNotFoundPage();

    const link = screen.getByRole('link', { name: /go to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders a Go back control', () => {
    renderNotFoundPage();

    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  it('does not add a nested main landmark (renders inside the app shell)', () => {
    renderNotFoundPage();

    // The 404 is rendered within AppLayout's <main>, so it must not introduce
    // its own <main> — that would create duplicate top-level landmarks (#3626).
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});
