// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for TaxCenterPage.
 *
 * Mocks the useInvestments / useAccounts / useTransactions hooks (not
 * repositories) per project conventions, and wraps the page in a router since
 * it renders a <Link> back to Investments. Asserts the page exposes its title
 * as the single level-1 heading so the heading hierarchy stays intact
 * (issue #3203).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { TaxCenterPage } from './TaxCenterPage';

vi.mock('../hooks', () => ({
  useInvestments: vi.fn(),
  useAccounts: vi.fn(),
  useTransactions: vi.fn(),
}));

import { useAccounts, useInvestments, useTransactions } from '../hooks';

const mockedUseInvestments = vi.mocked(useInvestments);
const mockedUseAccounts = vi.mocked(useAccounts);
const mockedUseTransactions = vi.mocked(useTransactions);

function renderPage() {
  return render(
    <MemoryRouter>
      <TaxCenterPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedUseInvestments.mockReturnValue({
    investments: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    getLots: vi.fn(() => []),
  } as unknown as ReturnType<typeof useInvestments>);

  mockedUseAccounts.mockReturnValue({
    accounts: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useAccounts>);

  mockedUseTransactions.mockReturnValue({
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useTransactions>);
});

describe('TaxCenterPage', () => {
  it('exposes the page title as the single level-1 heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Tax Center' })).toBeInTheDocument();
  });

  it('renders the back-to-investments link', () => {
    renderPage();

    expect(screen.getByRole('link', { name: /back to investments/i })).toBeInTheDocument();
  });
});
