// SPDX-License-Identifier: BUSL-1.1

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NaturalLanguageInput } from './NaturalLanguageInput';
import type { NaturalLanguageInputProps } from './NaturalLanguageInput';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

const defaultAccounts = [
  {
    id: 'acc-1',
    householdId: 'h1',
    name: 'Checking',
    type: 'CHECKING' as const,
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100000 },
    isArchived: false,
    sortOrder: 1,
    icon: null,
    color: null,
    ...syncMetadata,
  },
];

const defaultCategories = [
  {
    id: 'cat-food',
    householdId: 'h1',
    name: 'Food',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
  },
];

function renderInput(overrides: Partial<NaturalLanguageInputProps> = {}) {
  const defaultProps: NaturalLanguageInputProps = {
    accounts: defaultAccounts,
    categories: defaultCategories,
    onSubmit: vi.fn(),
    defaultAccountId: 'acc-1',
    householdId: 'h1',
    ...overrides,
  };

  return render(<NaturalLanguageInput {...defaultProps} />);
}

describe('NaturalLanguageInput', () => {
  it('renders the input field with label', () => {
    renderInput();
    expect(screen.getByLabelText('Quick add transaction')).toBeInTheDocument();
  });

  it('renders the placeholder text', () => {
    renderInput();
    expect(screen.getByPlaceholderText(/coffee at starbucks/i)).toBeInTheDocument();
  });

  it('shows parse preview when input has content', () => {
    renderInput();
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'coffee $5.50' },
    });
    expect(screen.getByText('$5.50')).toBeInTheDocument();
    expect(screen.getByText('EXPENSE')).toBeInTheDocument();
  });

  it('shows matched category in preview', () => {
    renderInput();
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'coffee at cafe $5.50' },
    });
    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  it('shows confidence level', () => {
    renderInput();
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'coffee at starbucks $5.50 today' },
    });
    const confidenceEl = screen.getByText(/confidence/i);
    expect(confidenceEl).toBeInTheDocument();
  });

  it('disables submit button when no amount parsed', () => {
    renderInput();
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'just some text' },
    });
    expect(screen.getByRole('button', { name: /add transaction/i })).toBeDisabled();
  });

  it('enables submit button when amount is parsed', () => {
    renderInput();
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'coffee $5.50' },
    });
    expect(screen.getByRole('button', { name: /add transaction/i })).not.toBeDisabled();
  });

  it('calls onSubmit with parsed data on form submit', () => {
    const onSubmit = vi.fn();
    renderInput({ onSubmit });
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'coffee $5.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: 'h1',
        accountId: 'acc-1',
        type: 'EXPENSE',
        amount: { amount: 550 },
      }),
    );
  });

  it('clears input after submit', () => {
    const onSubmit = vi.fn();
    renderInput({ onSubmit });
    const input = screen.getByLabelText('Quick add transaction');
    fireEvent.change(input, { target: { value: 'coffee $5.50' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(input).toHaveValue('');
  });

  it('shows success message after submit', () => {
    const onSubmit = vi.fn();
    renderInput({ onSubmit });
    fireEvent.change(screen.getByLabelText('Quick add transaction'), {
      target: { value: 'coffee $5.50' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(screen.getByText('Transaction added!')).toBeInTheDocument();
  });

  it('clears input on Escape key', () => {
    renderInput();
    const input = screen.getByLabelText('Quick add transaction');
    fireEvent.change(input, { target: { value: 'coffee $5.50' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveValue('');
  });

  it('has aria-describedby linking to preview', () => {
    renderInput();
    const input = screen.getByLabelText('Quick add transaction');
    expect(input).toHaveAttribute('aria-describedby', 'nl-parse-preview');
  });

  it('does not show preview when input is empty', () => {
    renderInput();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
