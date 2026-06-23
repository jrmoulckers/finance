// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Account, Category } from '../../kmp/bridge';
import type { CreateTransactionInput } from '../../db/repositories/transactions';
import { QuickAddTransaction } from './QuickAddTransaction';

// Focus trapping relies on real DOM focus management; stub it for deterministic
// jsdom runs. The dialog body still renders and behaves normally.
vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const account: Account = {
  id: 'acc-1',
  householdId: 'hh-1',
  name: 'Checking',
  type: 'CHECKING',
  currency: { code: 'USD', decimalPlaces: 2 },
  currentBalance: { amount: 100000 },
  isArchived: false,
  sortOrder: 0,
  icon: null,
  color: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as unknown as Account;

function makeCategory(id: string, name: string, isIncome = false): Category {
  return {
    id,
    name,
    isIncome,
    householdId: 'hh-1',
    icon: null,
    color: null,
    parentId: null,
    isSystem: false,
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  } as unknown as Category;
}

const categories: Category[] = [
  makeCategory('cat-dining', 'Dining Out'),
  makeCategory('cat-transport', 'Transport'),
  makeCategory('cat-income', 'Salary', true),
];

function renderQuickAdd(onCreate = vi.fn().mockResolvedValue(undefined)) {
  render(<QuickAddTransaction accounts={[account]} categories={categories} onCreate={onCreate} />);
  return onCreate;
}

async function openDialog() {
  fireEvent.click(screen.getByTestId('quick-add-fab'));
  return screen.findByRole('dialog');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuickAddTransaction', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders an accessible FAB that is collapsed by default', () => {
    renderQuickAdd();
    const fab = screen.getByTestId('quick-add-fab');
    expect(fab).toHaveAccessibleName('Quick add expense');
    expect(fab).toHaveAttribute('aria-expanded', 'false');
    expect(fab).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('opens an accessible modal dialog from the FAB', async () => {
    renderQuickAdd();
    const dialog = await openDialog();

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(screen.getByTestId('quick-add-fab')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Quick add expense' })).toBeInTheDocument();
  });

  it('exposes all four instant presets as buttons', async () => {
    renderQuickAdd();
    await openDialog();

    for (const label of ['Cash', 'Coffee', 'Lunch', 'Transit']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('prefills amount and category when a preset is tapped', async () => {
    renderQuickAdd();
    await openDialog();

    fireEvent.click(screen.getByTestId('quick-add-preset-coffee'));

    expect(screen.getByTestId('quick-add-amount')).toHaveValue('5.00');
    expect(screen.getByTestId('quick-add-category')).toHaveValue('cat-dining');
    expect(screen.getByTestId('quick-add-preset-coffee')).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves an expense as negative integer cents and remembers defaults', async () => {
    const onCreate = renderQuickAdd();
    await openDialog();

    fireEvent.change(screen.getByTestId('quick-add-amount'), { target: { value: '12.50' } });
    fireEvent.change(screen.getByTestId('quick-add-category'), {
      target: { value: 'cat-transport' },
    });
    fireEvent.click(screen.getByTestId('quick-add-save'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const input = onCreate.mock.calls[0][0] as CreateTransactionInput;
    expect(input).toMatchObject({
      accountId: 'acc-1',
      householdId: 'hh-1',
      type: 'EXPENSE',
      amount: { amount: -1250 },
      categoryId: 'cat-transport',
    });

    // Remembered defaults persisted (as bare values under their own keys) for next time.
    expect(localStorage.getItem('finance:quick-add-last-account')).toBe('acc-1');
    expect(localStorage.getItem('finance:quick-add-last-category')).toBe('cat-transport');
  });

  it('allows skipping the payee for on-the-go capture', async () => {
    const onCreate = renderQuickAdd();
    await openDialog();

    fireEvent.change(screen.getByTestId('quick-add-amount'), { target: { value: '3.00' } });
    fireEvent.click(screen.getByTestId('quick-add-save'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const input = onCreate.mock.calls[0][0] as CreateTransactionInput;
    expect(input.payee).toBeNull();
    expect(input.amount).toEqual({ amount: -300 });
  });

  it('validates that an amount is required', async () => {
    const onCreate = renderQuickAdd();
    await openDialog();

    fireEvent.click(screen.getByTestId('quick-add-save'));

    expect(await screen.findByTestId('quick-add-error')).toHaveTextContent(/greater than zero/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('closes on Escape without saving', async () => {
    const onCreate = renderQuickAdd();
    const dialog = await openDialog();

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onCreate).not.toHaveBeenCalled();
  });
});
