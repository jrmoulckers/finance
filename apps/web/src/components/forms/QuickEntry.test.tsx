// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Account, Category } from '../../kmp/bridge';
import { QuickEntry, LAST_ACCOUNT_KEY, LAST_TYPE_KEY } from './QuickEntry';

// Mock the focus trap
vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const mockAccounts: Account[] = [
  {
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
    ...syncMetadata,
  },
  {
    id: 'acc-2',
    householdId: 'hh-1',
    name: 'Savings',
    type: 'SAVINGS',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 500000 },
    isArchived: false,
    sortOrder: 1,
    icon: null,
    color: null,
    ...syncMetadata,
  },
];

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    householdId: 'hh-1',
    name: 'Food',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
    ...syncMetadata,
  },
];

function renderQuickEntry(overrides = {}) {
  const props = {
    isOpen: true,
    accounts: mockAccounts,
    categories: mockCategories,
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    suggestCategory: vi.fn().mockReturnValue(null),
    ...overrides,
  };
  return { ...render(<QuickEntry {...props} />), props };
}

function enterIncrementalAmount(centsDigits: string) {
  const amountInput = screen.getByLabelText('Amount');

  centsDigits.split('').forEach((digit) => {
    fireEvent.keyDown(amountInput, { key: digit });
  });

  return amountInput;
}

describe('QuickEntry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <QuickEntry
        isOpen={false}
        accounts={mockAccounts}
        categories={mockCategories}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when isOpen is true', () => {
    renderQuickEntry();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('displays the Quick Add title', () => {
    renderQuickEntry();
    expect(screen.getByText('Quick Add')).toBeInTheDocument();
  });

  it('shows expense and income type buttons', () => {
    renderQuickEntry();
    expect(screen.getByRole('radio', { name: 'Expense' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Income' })).toBeInTheDocument();
  });

  it('shows amount input', () => {
    renderQuickEntry();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
  });

  it('shows description input', () => {
    renderQuickEntry();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('shows account selector when multiple accounts exist', () => {
    renderQuickEntry();
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
  });

  it('hides account selector with a single account', () => {
    renderQuickEntry({ accounts: [mockAccounts[0]] });
    expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  it('defaults to Expense type', () => {
    renderQuickEntry();
    const expenseBtn = screen.getByRole('radio', { name: 'Expense' });
    expect(expenseBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles to Income type when clicked', () => {
    renderQuickEntry();
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(screen.getByRole('radio', { name: 'Income' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Expense' })).toHaveAttribute('aria-checked', 'false');
  });

  it('shows error when submitting empty amount', () => {
    renderQuickEntry();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid amount');
  });

  it('shows error when submitting empty description', () => {
    renderQuickEntry();
    enterIncrementalAmount('500');
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a description');
  });

  it('calls onSubmit with correct data on valid submission', () => {
    const { props } = renderQuickEntry();

    enterIncrementalAmount('1250');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Coffee' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(props.onSubmit).toHaveBeenCalledOnce();
    const submitted = props.onSubmit.mock.calls[0][0];
    expect(submitted.amount.amount).toBe(-1250);
    expect(submitted.payee).toBe('Coffee');
    expect(submitted.type).toBe('EXPENSE');
    expect(submitted.accountId).toBe('acc-1');
  });

  it('clears form after successful submission', () => {
    renderQuickEntry();

    enterIncrementalAmount('500');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Snack' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(screen.getByLabelText('Amount')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
  });

  it('shows success counter after submissions', () => {
    renderQuickEntry();

    // First submission
    enterIncrementalAmount('300');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Item 1' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(screen.getByText('1 added')).toBeInTheDocument();

    // Second submission
    enterIncrementalAmount('400');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Item 2' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(screen.getByText('2 added')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const { props } = renderQuickEntry();
    fireEvent.click(screen.getByLabelText('Close quick entry'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const { props } = renderQuickEntry();
    // The backdrop is the first element with aria-hidden
    const backdrop = screen.getByRole('dialog').parentElement!.querySelector('[aria-hidden]')!;
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // localStorage persistence
  // -------------------------------------------------------------------------

  it('remembers last-used account', () => {
    renderQuickEntry();

    // Switch to second account
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'acc-2' } });
    enterIncrementalAmount('100');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Test' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe('acc-2');
  });

  it('remembers last-used transaction type', () => {
    renderQuickEntry();

    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    enterIncrementalAmount('100');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Test' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    expect(localStorage.getItem(LAST_TYPE_KEY)).toBe('INCOME');
  });

  // -------------------------------------------------------------------------
  // Auto-categorization
  // -------------------------------------------------------------------------

  it('shows category suggestion when provided', () => {
    const suggestCategory = vi.fn().mockReturnValue({
      categoryId: 'cat-1',
      categoryName: 'Food',
      confidence: 0.92,
    });

    renderQuickEntry({ suggestCategory });

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Grocery Store' },
    });

    expect(screen.getByText('Food (92%)')).toBeInTheDocument();
  });

  it('does not show suggestion when suggestCategory returns null', () => {
    renderQuickEntry();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Unknown' },
    });
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('dialog has aria-modal attribute', () => {
    renderQuickEntry();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('dialog is labelled by its title', () => {
    renderQuickEntry();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'quick-entry-title');
  });

  it('type toggle has radiogroup role', () => {
    renderQuickEntry();
    expect(screen.getByRole('radiogroup', { name: 'Transaction type' })).toBeInTheDocument();
  });

  it('amount input has aria-required', () => {
    renderQuickEntry();
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Amount')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('builds and backspaces the amount display incrementally', () => {
    renderQuickEntry();

    const amountInput = enterIncrementalAmount('1234');
    expect(screen.getByText('-$12.34')).toBeInTheDocument();

    fireEvent.keyDown(amountInput, { key: 'Backspace' });
    expect(screen.getByText('-$1.23')).toBeInTheDocument();
  });

  it('description input has aria-required', () => {
    renderQuickEntry();
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-required', 'true');
  });

  it('success counter uses aria-live for screen reader updates', () => {
    renderQuickEntry();
    enterIncrementalAmount('100');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Test' },
    });
    fireEvent.submit(screen.getByRole('dialog').querySelector('form')!);

    const counter = screen.getByText('1 added');
    expect(counter).toHaveAttribute('role', 'status');
  });
});
