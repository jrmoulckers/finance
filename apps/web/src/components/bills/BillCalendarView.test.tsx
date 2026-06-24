// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BillCalendarView } from './BillCalendarView';
import type { Bill } from '../../kmp/bridge';

const SCHEDULE_STORAGE_NAME = 'finance.bills.paydaySchedule.v1';

const SYNC_METADATA = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

/** ISO local date offset from today by `days`. */
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeBill(overrides: Partial<Bill> & { name: string; dueDate: string }): Bill {
  return {
    ...SYNC_METADATA,
    id: `bill-${overrides.name}`,
    householdId: 'h1',
    payee: 'Payee',
    amount: { amount: 5000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    frequency: 'MONTHLY',
    status: 'UPCOMING',
    categoryId: null,
    accountId: null,
    note: null,
    isAutoPay: false,
    reminderDaysBefore: 3,
    lastPaidDate: null,
    ...overrides,
  };
}

function seedSchedule(incomeDollars: string): void {
  window.localStorage.setItem(
    SCHEDULE_STORAGE_NAME,
    JSON.stringify({ cadence: 'MONTHLY', anchorDate: isoOffset(0), incomeDollars }),
  );
}

describe('BillCalendarView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders an accessible payday schedule form', () => {
    render(<BillCalendarView bills={[]} />);

    const form = screen.getByRole('form', { name: 'Payday schedule' });
    expect(within(form).getByLabelText('Pay cadence')).toBeInTheDocument();
    expect(within(form).getByLabelText('A recent payday')).toBeInTheDocument();
    expect(within(form).getByLabelText('Expected income per paycheck')).toBeInTheDocument();
  });

  it('groups upcoming bills under a payday heading', () => {
    seedSchedule('2000');
    const bills = [makeBill({ name: 'Electric', dueDate: isoOffset(5), amount: { amount: 5000 } })];

    render(<BillCalendarView bills={bills} />);

    expect(screen.getByRole('region', { name: 'Bills by pay period' })).toBeInTheDocument();
    expect(screen.getAllByText(/^Payday/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Electric').length).toBeGreaterThan(0);
  });

  it('shows a covered status when income exceeds bills due', () => {
    seedSchedule('2000'); // $2,000 income
    const bills = [makeBill({ name: 'Phone', dueDate: isoOffset(3), amount: { amount: 5000 } })];

    render(<BillCalendarView bills={bills} />);

    expect(screen.getAllByText(/Covered/).length).toBeGreaterThan(0);
  });

  it('shows a shortfall status when bills exceed income', () => {
    seedSchedule('40'); // $40 income, well under the bill
    const bills = [makeBill({ name: 'Rent', dueDate: isoOffset(3), amount: { amount: 120000 } })];

    render(<BillCalendarView bills={bills} />);

    expect(screen.getAllByText(/Short by/).length).toBeGreaterThan(0);
  });

  it('flags a high-risk week when bills exceed the paycheck', () => {
    seedSchedule('40'); // $40 income, well under the bill
    const bills = [makeBill({ name: 'Rent', dueDate: isoOffset(3), amount: { amount: 120000 } })];

    render(<BillCalendarView bills={bills} />);

    expect(screen.getAllByText('High-risk week').length).toBeGreaterThan(0);
  });

  it('surfaces one-time (kid) expenses with a distinct badge and explainer', () => {
    seedSchedule('2000');
    const bills = [
      makeBill({
        name: 'Soccer signup',
        dueDate: isoOffset(4),
        frequency: 'ONE_TIME',
        amount: { amount: 8500 },
      }),
    ];

    render(<BillCalendarView bills={bills} />);

    // A "One-time" tag is rendered next to the bill name.
    expect(screen.getAllByText(/One-time/i).length).toBeGreaterThan(0);
    // The schedule form explains where one-off kid expenses appear.
    expect(screen.getByText(/school fees, birthdays/i)).toBeInTheDocument();
  });

  it('announces high-risk weeks in the live summary region', () => {
    seedSchedule('40');
    const bills = [makeBill({ name: 'Rent', dueDate: isoOffset(3), amount: { amount: 120000 } })];

    const { container } = render(<BillCalendarView bills={bills} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent ?? '').toMatch(/high-risk/i);
  });

  it('prompts for income before computing coverage', () => {
    seedSchedule(''); // no income provided
    const bills = [makeBill({ name: 'Water', dueDate: isoOffset(3), amount: { amount: 4000 } })];

    render(<BillCalendarView bills={bills} />);

    expect(screen.getAllByText(/Add income to check coverage/).length).toBeGreaterThan(0);
  });
});
