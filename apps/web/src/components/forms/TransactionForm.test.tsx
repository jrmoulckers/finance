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
    expect(screen.getByLabelText('Payee')).toBeInTheDocument();
    expect(screen.getByText(/What appears on your statement/i)).toBeInTheDocument();
    expect(screen.getByText(/The actual merchant or person/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2025-06-15');
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
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
    expect(screen.getByText('Please select an account.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Some fields need attention/);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with transformed transaction data on valid submission', async () => {
    const { onSubmit } = renderTransactionForm();

    // Amount: type digits via keydown to get $12.34 (1234 cents)
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '1' });
    fireEvent.keyDown(amountInput, { key: '2' });
    fireEvent.keyDown(amountInput, { key: '3' });
    fireEvent.keyDown(amountInput, { key: '4' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: ' Coffee Shop ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'category-food' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2025-06-10' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: ' Morning treat ' } });
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'coffee, morning' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 'household-1',
      accountId: 'account-1',
      type: 'INCOME',
      status: 'PENDING',
      amount: { amount: 1234 },
      currency: { code: 'USD', decimalPlaces: 2 },
      payee: 'Coffee Shop',
      date: '2025-06-10',
      categoryId: 'category-food',
      note: 'Morning treat',
      tags: ['coffee', 'morning'],
      merchantCity: null,
      merchantState: null,
      merchantZip: null,
      merchantCountry: null,
      statementDescription: null,
      externalReferenceId: null,
      customFields: null,
      extraNotes: null,
      counterpartyName: null,
    });
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const { onCancel } = renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks body scrolling while the modal is open and restores it on close', () => {
    document.body.style.overflow = 'auto';

    const { rerender } = render(
      <TransactionForm
        isOpen={true}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <TransactionForm
        isOpen={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        accounts={accounts}
        categories={categories}
      />,
    );

    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  // ---------------------------------------------------------------------------
  // Additional details
  // ---------------------------------------------------------------------------

  it('shows additional details section when expanded', () => {
    renderTransactionForm();

    // Additional details section is collapsed by default
    expect(screen.queryByLabelText('Merchant City')).not.toBeInTheDocument();

    // Expand it
    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));

    expect(screen.getByLabelText('Merchant City')).toHaveAttribute('placeholder', 'Seattle');
    expect(screen.getByLabelText('Merchant State')).toHaveAttribute('placeholder', 'WA');
    expect(screen.getByLabelText('Merchant ZIP')).toBeInTheDocument();
    expect(screen.getByLabelText('Merchant Country')).toBeInTheDocument();
    expect(screen.getByLabelText('Statement Description')).toBeInTheDocument();
    expect(screen.getByLabelText('External Reference ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Extra Notes')).not.toHaveAttribute('placeholder');
    expect(screen.getByText('+ Add Field')).toBeInTheDocument();
  });

  it('can add and remove custom field entries', () => {
    renderTransactionForm();

    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));
    fireEvent.click(screen.getByText('+ Add Field'));

    expect(screen.getByLabelText('Custom field 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom field 1 value')).toBeInTheDocument();

    // Remove it
    fireEvent.click(screen.getByRole('button', { name: /remove custom field 1/i }));
    expect(screen.queryByLabelText('Custom field 1 name')).not.toBeInTheDocument();
  });

  it('includes additional fields in submission data', async () => {
    const { onSubmit } = renderTransactionForm();

    // Fill required fields ΓÇö amount uses keyDown events with useAmountInput
    const amountInput = screen.getByLabelText('Amount');
    fireEvent.keyDown(amountInput, { key: '5' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });
    fireEvent.keyDown(amountInput, { key: '0' });

    fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Test Merchant' } });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-1' } });

    // Expand and fill additional fields
    fireEvent.click(screen.getByRole('button', { name: /additional details/i }));
    fireEvent.change(screen.getByLabelText('Merchant City'), { target: { value: 'Denver' } });
    fireEvent.change(screen.getByLabelText('Merchant State'), { target: { value: 'CO' } });
    fireEvent.change(screen.getByLabelText('Statement Description'), {
      target: { value: 'TEST MERCHANT #1' },
    });
    fireEvent.change(screen.getByLabelText('Extra Notes'), {
      target: { value: 'Imported transaction' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantCity: 'Denver',
        merchantState: 'CO',
        statementDescription: 'TEST MERCHANT #1',
        extraNotes: 'Imported transaction',
      }),
    );
  });
});
