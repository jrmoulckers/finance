// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useBills } from '../hooks';
import { BillDetailPage } from './BillDetailPage';

vi.mock('../hooks', () => ({
  useBills: vi.fn(),
}));

const mockedUseBills = vi.mocked(useBills);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const mockBill = {
  id: 'bill-1',
  householdId: 'household-1',
  name: 'Electric Bill',
  payee: 'Power Company',
  amount: { amount: 12500 },
  currency: { code: 'USD', decimalPlaces: 2 },
  dueDate: '2025-02-15',
  frequency: 'MONTHLY' as const,
  status: 'UPCOMING' as const,
  categoryId: null,
  accountId: null,
  note: 'Monthly electricity',
  isAutoPay: false,
  reminderDaysBefore: 3,
  lastPaidDate: '2025-01-15',
  ...syncMetadata,
};

function renderWithRoute(billId: string) {
  return render(
    <MemoryRouter initialEntries={[`/bills/${billId}`]}>
      <Routes>
        <Route path="/bills/:id" element={<BillDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BillDetailPage', () => {
  beforeEach(() => {
    mockedUseBills.mockReturnValue({
      bills: [mockBill],
      summary: { upcomingCount: 1, overdueCount: 0, totalUpcoming: 12500, totalOverdue: 0 },
      loading: false,
      error: null,
      notificationPermission: 'default',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn().mockResolvedValue('default'),
    });
  });

  it('renders bill name and details', () => {
    renderWithRoute('bill-1');

    expect(screen.getByText('Electric Bill')).toBeInTheDocument();
    expect(screen.getByText('Power Company')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
  });

  it('renders key information section', () => {
    renderWithRoute('bill-1');

    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Due Date')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
  });

  it('renders mark paid button for upcoming bill', () => {
    renderWithRoute('bill-1');

    expect(screen.getByLabelText('Mark Electric Bill as paid')).toBeInTheDocument();
  });

  it('renders not found when bill does not exist', () => {
    renderWithRoute('bill-nonexistent');

    expect(screen.getByText('Bill not found.')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    mockedUseBills.mockReturnValue({
      bills: [],
      summary: { upcomingCount: 0, overdueCount: 0, totalUpcoming: 0, totalOverdue: 0 },
      loading: true,
      error: null,
      notificationPermission: 'default',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn().mockResolvedValue('default'),
    });

    renderWithRoute('bill-1');

    expect(screen.getByRole('status', { name: 'Loading bill details' })).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockedUseBills.mockReturnValue({
      bills: [],
      summary: { upcomingCount: 0, overdueCount: 0, totalUpcoming: 0, totalOverdue: 0 },
      loading: false,
      error: 'Database error',
      notificationPermission: 'default',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn().mockResolvedValue('default'),
    });

    renderWithRoute('bill-1');

    expect(screen.getByText('Database error')).toBeInTheDocument();
  });

  it('renders note when present', () => {
    renderWithRoute('bill-1');

    expect(screen.getByText('Monthly electricity')).toBeInTheDocument();
  });
});
