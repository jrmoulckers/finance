// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundPage } from './NotFoundPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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

  it('renders a history-aware "Go back" button that navigates back', async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderNotFoundPage();

    const backButton = screen.getByRole('button', { name: /go back/i });
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
