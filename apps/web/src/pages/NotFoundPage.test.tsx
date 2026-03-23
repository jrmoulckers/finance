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
  it('renders the 404 heading', () => {
    renderNotFoundPage();

    expect(screen.getByRole('heading', { level: 1, name: /404/i })).toBeInTheDocument();
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

  it('renders a link to the login page', () => {
    renderNotFoundPage();

    const link = screen.getByRole('link', { name: /go to login/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('uses a semantic <main> landmark', () => {
    renderNotFoundPage();

    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
