// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardThingsToCheckSection from './DashboardThingsToCheckSection';
import { useTransactions } from '../../hooks';
import { detectScamAlerts, type ScamSpendingAlert } from '../../lib/notifications';

vi.mock('../../hooks', () => ({
  useTransactions: vi.fn(),
}));

// Partial mock: control the detection output deterministically while keeping the
// real routeUnusualSpendAlert so navigation targets are exercised end-to-end.
vi.mock('../../lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/notifications')>();
  return { ...actual, detectScamAlerts: vi.fn() };
});

const mockedUseTransactions = vi.mocked(useTransactions);
const mockedDetectScamAlerts = vi.mocked(detectScamAlerts);

const singleTransactionAlert: ScamSpendingAlert = {
  id: 'scam-new-merchant-tx-1',
  rule: 'new-merchant',
  title: 'New merchant to review',
  message: 'We noticed a $99.00 charge from "Unknown Merchant".',
  nextStep: "If you don't recognize it, call your bank using the number on your card.",
  severity: 'info',
  transactionIds: ['tx-1'],
  merchantName: 'Unknown Merchant',
  amountCents: 9900,
  createdAt: '2025-03-02T12:00:00Z',
};

const duplicateAlert: ScamSpendingAlert = {
  id: 'scam-duplicate-tx-2-tx-3',
  rule: 'possible-duplicate',
  title: 'Check for a duplicate charge',
  message: 'We noticed two $42.00 charges from "Repeat Store" within 24 hours.',
  nextStep: 'If you only bought this once, contact the merchant or your bank.',
  severity: 'warning',
  transactionIds: ['tx-2', 'tx-3'],
  merchantName: 'Repeat Store',
  amountCents: 4200,
  createdAt: '2025-03-03T12:00:00Z',
};

function renderSection() {
  return render(
    <MemoryRouter>
      <DashboardThingsToCheckSection accounts={[]} selectedPurposeFilter="all" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseTransactions.mockReturnValue({
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  });
  mockedDetectScamAlerts.mockReturnValue([]);
});

describe('DashboardThingsToCheckSection', () => {
  it('shows a calm empty state when there are no alerts', () => {
    renderSection();

    expect(screen.getByText('Everything looks normal.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /review/i })).not.toBeInTheDocument();
  });

  it('links a single-transaction alert to its transaction detail page', () => {
    mockedDetectScamAlerts.mockReturnValue([singleTransactionAlert]);

    renderSection();

    const reviewLink = screen.getByRole('link', {
      name: 'Review the flagged charge from Unknown Merchant',
    });
    expect(reviewLink).toHaveAttribute('href', '/transactions/tx-1');
    expect(reviewLink).toHaveTextContent('Review');
  });

  it('links a duplicate/rapid alert to the filtered transactions list', () => {
    mockedDetectScamAlerts.mockReturnValue([duplicateAlert]);

    renderSection();

    const reviewLink = screen.getByRole('link', {
      name: 'Review 2 flagged transactions: Check for a duplicate charge',
    });
    const href = reviewLink.getAttribute('href') ?? '';
    expect(href.startsWith('/transactions?')).toBe(true);
    expect(href).toContain('alertType=scam_check');
    expect(href).toContain('rule=possible-duplicate');
    expect(href).toContain('transactionIds=tx-2%2Ctx-3');
  });

  it('renders one review action per displayed alert', () => {
    mockedDetectScamAlerts.mockReturnValue([singleTransactionAlert, duplicateAlert]);

    renderSection();

    expect(screen.getAllByRole('link', { name: /^Review/ })).toHaveLength(2);
  });
});
