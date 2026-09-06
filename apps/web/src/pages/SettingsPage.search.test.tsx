// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useAccessibility', () => ({
  useAccessibility: () => ({
    isSimplified: false,
  }),
}));

import { SettingsPage } from './SettingsPage';

function renderShell(): void {
  render(
    <MemoryRouter initialEntries={['/settings/account']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="account" replace />} />
          <Route path="account" element={<div>Account page</div>} />
          <Route path="preferences" element={<div>Preferences page</div>} />
          <Route path="privacy" element={<div>Privacy page</div>} />
          <Route path="security" element={<div>Security page</div>} />
          <Route path="sync" element={<div>Sync page</div>} />
          <Route path="advanced" element={<div>Advanced page</div>} />
          <Route path="about" element={<div>About page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('SettingsPage search filter', () => {
  it('shows all sections when the query is empty', () => {
    renderShell();

    const nav = screen.getByRole('navigation', { name: /settings sections/i });
    expect(nav.querySelectorAll('a').length).toBe(8);
    expect(screen.getByRole('link', { name: /Plan & Billing/i })).toBeVisible();
  });

  it('filters sections by keyword match', () => {
    renderShell();

    fireEvent.change(screen.getByRole('searchbox', { name: /search settings/i }), {
      target: { value: 'passkey' },
    });

    const nav = screen.getByRole('navigation', { name: /settings sections/i });
    const links = nav.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toMatch(/Sync & Devices/i);
  });

  it('matches on the visible description text', () => {
    renderShell();

    fireEvent.change(screen.getByRole('searchbox', { name: /search settings/i }), {
      target: { value: 'encryption' },
    });

    const nav = screen.getByRole('navigation', { name: /settings sections/i });
    const links = nav.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toMatch(/Security/i);
  });

  it('shows an empty state when nothing matches', () => {
    renderShell();

    fireEvent.change(screen.getByRole('searchbox', { name: /search settings/i }), {
      target: { value: 'zzznomatch' },
    });

    expect(screen.getByText(/no settings match your search/i)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /settings sections/i });
    expect(nav.querySelectorAll('a').length).toBe(0);
  });

  it('restores all sections when the query is cleared', () => {
    renderShell();

    const search = screen.getByRole('searchbox', { name: /search settings/i });
    fireEvent.change(search, { target: { value: 'passkey' } });
    fireEvent.change(search, { target: { value: '' } });

    const nav = screen.getByRole('navigation', { name: /settings sections/i });
    expect(nav.querySelectorAll('a').length).toBe(8);
  });
});
