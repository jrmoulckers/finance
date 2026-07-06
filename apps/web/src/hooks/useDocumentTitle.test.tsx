// @vitest-environment jsdom
// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import type { FC } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDocumentTitle } from './useDocumentTitle';

const DashboardView: FC = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/cash-runway')}>
      go to cash runway
    </button>
  );
};

/** Calls the hook, then renders whichever route is active. */
const TitleProbe: FC = () => {
  useDocumentTitle();
  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardView />} />
      <Route path="*" element={<span>page</span>} />
    </Routes>
  );
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TitleProbe />
    </MemoryRouter>,
  );
}

const ROUTE_TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/fire', 'FIRE Planner · Finance'],
  ['/cash-runway', 'Cash Runway · Finance'],
  ['/expected-income', 'Expected Income · Finance'],
  ['/trip-budgets', 'Trip & Country Budgets · Finance'],
  ['/remittances', 'Remittances · Finance'],
  ['/building-credit', 'Building Credit · Finance'],
  ['/live-pnl', 'Live P&L · Finance'],
  ['/business-pnl', 'Profit & Loss · Finance'],
  ['/gig-driver', 'Gig Driver Economics · Finance'],
  ['/dashboard', 'Dashboard · Finance'],
  ['/settings/security', 'Security & Encryption · Finance'],
  ['/accounts/abc123', 'Accounts · Finance'],
];

describe('useDocumentTitle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.title = 'Finance';
  });

  it.each(ROUTE_TITLES)('sets document.title to "%s → %s"', (path, expected) => {
    renderAt(path);
    expect(document.title).toBe(expected);
  });

  it('updates document.title when the route changes', () => {
    renderAt('/dashboard');
    expect(document.title).toBe('Dashboard · Finance');

    fireEvent.click(screen.getByRole('button', { name: 'go to cash runway' }));

    expect(document.title).toBe('Cash Runway · Finance');
  });

  it('shows a Not Found title for unmapped routes', () => {
    renderAt('/definitely-not-a-route');
    expect(document.title).toBe('Page Not Found · Finance');
  });
});
