// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundPage } from './NotFoundPage';
import { trackNotFound } from '../lib/monitoring';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../lib/monitoring', () => ({
  trackNotFound: vi.fn(),
}));

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

  it('does not render a nested <main> landmark (renders inside AppLayout main)', () => {
    renderNotFoundPage();

    // The 404 now renders inside AppLayout's <main>, so it must not introduce a
    // second top-level main landmark (#3626).
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('exposes a single labelled region for the empty state', () => {
    renderNotFoundPage();

    const region = screen.getByRole('region', { name: /404/i });
    expect(region).toBeInTheDocument();
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

  it('reports the unknown route to monitoring exactly once with the unmatched path', () => {
    vi.mocked(trackNotFound).mockClear();

    render(
      <MemoryRouter initialEntries={['/totally/unknown/deep-link']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(trackNotFound).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackNotFound).mock.calls[0][0]).toBe('/totally/unknown/deep-link');
  });
});
