// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Category } from '../../kmp/bridge';
import { TransactionForm, type TransactionFormProps } from './TransactionForm';

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

const accounts: Account[] = [
  {
    id: 'account-1',
    householdId: 'household-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 520000 },
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
  },
  {
    id: 'account-2',
    householdId: 'household-1',
    name: 'Savings',
    type: 'SAVINGS',
    currency: { code: 'EUR', decimalPlaces: 2 },
    currentBalance: { amount: 180000 },
    isArchived: false,
    sortOrder: 2,
    icon: 'wallet',
    color: '#16A34A',
    ...syncMetadata,
  },
];

const categories: Category[] = [
  {
    id: 'category-food',
    householdId: 'household-1',
    name: 'Food',
    icon: 'utensils',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
  },
  {
    id: 'category-income',
    householdId: 'household-1',
    name: 'Income',
    icon: 'wallet',
    color: '#059669',
    parentId: null,
    isIncome: true,
    isSystem: true,
    sortOrder: 2,
    ...syncMetadata,
  },
];

function renderTransactionForm(overrides: Partial<TransactionFormProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <TransactionForm
      isOpen={true}
      onSubmit={onSubmit}
      onCancel={onCancel}
      accounts={accounts}
      categories={categories}
      {...overrides}
    />,
  );

  return { onSubmit, onCancel };
}

describe('TransactionForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders form fields when open', () => {
    renderTransactionForm();

    expect(screen.getByRole('dialog', { name: 'New Transaction' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2025-06-15');
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add Transaction' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderTransactionForm({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows validation errors for empty required fields on submit', () => {
    const { onSubmit } = renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));

    expect(screen.getByText('Amount must be greater than zero.')).toBeInTheDocument();
    expect(screen.getByText('Description is required.')).toBeInTheDocument();
    expect(screen.getByText('Please select an account.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with transformed transaction data on valid submission', async () => {
    const { onSubmit } = renderTransactionForm();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.34' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: ' Coffee Shop ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'category-food' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-06-10' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: ' Morning treat ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 'household-1',
      accountId: 'account-1',
      type: 'INCOME',
      amount: { amount: 1234 },
      currency: { code: 'USD', decimalPlaces: 2 },
      payee: 'Coffee Shop',
      date: '2025-06-10',
      categoryId: 'category-food',
      note: 'Morning treat',
    });
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const { onCancel } = renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
