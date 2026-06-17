// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useAccessibility', () => ({
  useAccessibility: () => ({
    isSimplified: false,
  }),
}));

import { SettingsPage } from './SettingsPage';

describe('SettingsPage security navigation', () => {
  it('includes the Security section and renders the nested security route', () => {
    render(
      <MemoryRouter initialEntries={['/settings/security']}>
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

    const link = screen.getByRole('link', { name: /^Security/i });
    expect(link).toHaveAttribute('href', '/settings/security');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Security page')).toBeInTheDocument();
  });
});
