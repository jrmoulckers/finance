// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useBills } from '../hooks';
import { BillsPage } from './BillsPage';

const billsCss = readFileSync(resolve(process.cwd(), 'src/pages/BillsPage.css'), 'utf8');

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

const mockBills = [
  {
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
    note: null,
    isAutoPay: false,
    reminderDaysBefore: 3,
    lastPaidDate: '2025-01-15',
    ...syncMetadata,
  },
  {
    id: 'bill-2',
    householdId: 'household-1',
    name: 'Internet',
    payee: 'ISP Corp',
    amount: { amount: 7999 },
    currency: { code: 'USD', decimalPlaces: 2 },
    dueDate: '2025-02-01',
    frequency: 'MONTHLY' as const,
    status: 'OVERDUE' as const,
    categoryId: null,
    accountId: null,
    note: 'Fiber plan',
    isAutoPay: true,
    reminderDaysBefore: 5,
    lastPaidDate: null,
    ...syncMetadata,
  },
];

describe('BillsPage', () => {
  beforeEach(() => {
    mockedUseBills.mockReturnValue({
      bills: mockBills,
      summary: {
        upcomingCount: 1,
        overdueCount: 1,
        totalUpcoming: 12500,
        totalOverdue: 7999,
      },
      loading: false,
      error: null,
      notificationPermission: 'default',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn().mockResolvedValue('granted'),
    });
  });

  it('renders bills list with bill names', () => {
    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Bills & Reminders')).toBeInTheDocument();
    expect(screen.getByText('Electric Bill')).toBeInTheDocument();
    expect(screen.getByText('Internet')).toBeInTheDocument();
  });

  it('renders summary with upcoming and overdue counts', () => {
    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    const summarySection = screen.getByRole('region', { name: 'Bills summary' });
    expect(within(summarySection).getByText('Upcoming')).toBeInTheDocument();
    expect(within(summarySection).getByText('Overdue')).toBeInTheDocument();
    expect(within(summarySection).getAllByText('1 bill')).toHaveLength(2);
  });

  it('renders notification enable banner when permission is default', () => {
    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Enable notifications to get reminded before bills are due/),
    ).toBeInTheDocument();
  });

  it('hides notification banner when permission is granted', () => {
    mockedUseBills.mockReturnValue({
      bills: mockBills,
      summary: { upcomingCount: 1, overdueCount: 1, totalUpcoming: 12500, totalOverdue: 7999 },
      loading: false,
      error: null,
      notificationPermission: 'granted',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn().mockResolvedValue('granted'),
    });

    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText(/Enable notifications to get reminded before bills are due/),
    ).not.toBeInTheDocument();
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

    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Loading bills' })).toBeInTheDocument();
  });

  it('renders error state', () => {
    mockedUseBills.mockReturnValue({
      bills: [],
      summary: { upcomingCount: 0, overdueCount: 0, totalUpcoming: 0, totalOverdue: 0 },
      loading: false,
      error: 'Failed to load bills.',
      notificationPermission: 'default',
      refresh: vi.fn(),
      createBill: vi.fn(),
      updateBill: vi.fn(),
      deleteBill: vi.fn(),
      markPaid: vi.fn(),
      requestNotificationPermission: vi.fn().mockResolvedValue('default'),
    });

    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Failed to load bills.')).toBeInTheDocument();
  });

  it('renders empty state when no bills exist', () => {
    mockedUseBills.mockReturnValue({
      bills: [],
      summary: { upcomingCount: 0, overdueCount: 0, totalUpcoming: 0, totalOverdue: 0 },
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

    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No bills yet')).toBeInTheDocument();
  });

  it('renders mark paid button for upcoming bills', () => {
    render(
      <MemoryRouter>
        <BillsPage />
      </MemoryRouter>,
    );

    const markPaidButtons = screen.getAllByText('Mark Paid');
    expect(markPaidButtons.length).toBeGreaterThan(0);
  });

  describe('compact-width responsive layout (#2190)', () => {
    it('reflows the summary into a grid of three labelled metrics', () => {
      render(
        <MemoryRouter>
          <BillsPage />
        </MemoryRouter>,
      );

      const summarySection = screen.getByRole('region', { name: 'Bills summary' });
      const grid = summarySection.querySelector('.bills-summary__grid');
      expect(grid).not.toBeNull();
      expect(grid?.querySelectorAll('.bills-summary__metric')).toHaveLength(3);
    });

    it('applies scoped classes to the view toggle and status filter for compact tap targets', () => {
      render(
        <MemoryRouter>
          <BillsPage />
        </MemoryRouter>,
      );

      expect(screen.getByRole('group', { name: 'Choose bills view' })).toHaveClass(
        'bills-view-toggle',
      );
      expect(
        screen.getByLabelText('Filter bills by status').closest('.bills-filter'),
      ).not.toBeNull();
    });

    it('stacks the summary to a single column at iPhone SE width (<=375px)', () => {
      // Compact-width media query collapses the summary to one column.
      expect(billsCss).toMatch(/@media\s*\(max-width:\s*375px\)/);
      const compactBlock = billsCss.slice(billsCss.indexOf('@media (max-width: 375px)'));
      expect(compactBlock).toMatch(/\.bills-summary__grid\s*\{[^}]*grid-template-columns:\s*1fr/);
      // Interactive controls stretch to full width with a >=44px tap target.
      expect(compactBlock).toMatch(/\.bills-view-toggle[^}]*width:\s*100%/);
      expect(billsCss).toMatch(/\.bills-view-toggle\s\.form-button\s*\{[^}]*min-height:\s*44px/);
    });
  });
});
