// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for TransactionEditPanel component.
 * References: issue #1479
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import { TransactionEditPanel } from './TransactionEditPanel';
import type { Account, Category, Transaction } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockTransaction: Transaction = {
  id: 'txn-1',
  householdId: 'h1',
  accountId: 'acc-1',
  categoryId: 'cat-1',
  type: 'EXPENSE',
  status: 'CLEARED',
  amount: { amount: 2500 },
  currency: { code: 'USD', decimalPlaces: 2 },
  payee: 'Grocery Store',
  note: 'Weekly groceries',
  date: '2024-03-15',
  transferAccountId: null,
  transferTransactionId: null,
  isRecurring: false,
  recurringRuleId: null,
  tags: [],
  merchantAddress: null,
  merchantCity: null,
  merchantState: null,
  merchantZip: null,
  merchantCountry: null,
  externalReferenceId: null,
  statementDescription: null,
  customFields: null,
  extraNotes: null,
  counterpartyName: null,
  counterpartyAccountId: null,
  createdAt: '2024-03-15T10:00:00Z',
  updatedAt: '2024-03-15T10:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    householdId: 'h1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100000 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
] as Account[];

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    householdId: 'h1',
    name: 'Food',
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
] as unknown as Category[];

function enterIncrementalAmount(input: HTMLElement, centsDigits: string) {
  centsDigits.split('').forEach((digit) => {
    fireEvent.keyDown(input, { key: digit });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransactionEditPanel', () => {
  it('renders nothing when transaction is null', () => {
    const { container } = render(
      <TransactionEditPanel
        transaction={null}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the edit panel dialog when transaction is provided', () => {
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Transaction')).toBeInTheDocument();
  });

  it('pre-fills form fields with transaction data', () => {
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const payeeInput = screen.getByLabelText(/payee/i) as HTMLInputElement;
    expect(payeeInput.value).toBe('Grocery Store');

    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('-$25.00');

    const dateInput = screen.getByLabelText(/date/i, { selector: 'input' }) as HTMLInputElement;
    expect(dateInput.value).toBe('03/15/2024');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByLabelText(/close edit panel/i));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    const backdrop = document.querySelector('.edit-panel-backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('submits updated incremental amount values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    const amountInput = screen.getByLabelText(/amount/i);
    fireEvent.keyDown(amountInput, { key: 'Backspace' });
    fireEvent.keyDown(amountInput, { key: 'Backspace' });
    fireEvent.keyDown(amountInput, { key: 'Backspace' });
    fireEvent.keyDown(amountInput, { key: 'Backspace' });
    enterIncrementalAmount(amountInput, '1234');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        'txn-1',
        expect.objectContaining({
          amount: { amount: -1234 },
        }),
      );
    });
  });

  it('has proper aria attributes for accessibility', () => {
    render(
      <TransactionEditPanel
        transaction={mockTransaction}
        accounts={mockAccounts}
        categories={mockCategories}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'edit-panel-title');
  });
});
