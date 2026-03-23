// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/aria', () => ({
  announce: vi.fn(),
  useFocusTrap: vi.fn(),
}));

vi.mock('../../kmp/bridge', () => ({
  centsFromDollars: (d: number) => ({ amount: Math.round(d * 100) }),
  Currencies: {
    USD: { code: 'USD', decimalPlaces: 2 },
  },
}));

import { QuickEntryForm, type QuickEntryFormProps } from './QuickEntryForm';

function renderForm(overrides: Partial<QuickEntryFormProps> = {}) {
  const onClose = vi.fn<QuickEntryFormProps['onClose']>();
  const onSubmit = vi.fn<QuickEntryFormProps['onSubmit']>();

  const result = render(
    <QuickEntryForm
      isOpen={true}
      onClose={overrides.onClose ?? onClose}
      onSubmit={overrides.onSubmit ?? onSubmit}
      {...overrides}
    />,
  );

  return { onClose, onSubmit, ...result };
}

describe('QuickEntryForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders when open, hidden when closed', () => {
    const { rerender } = render(
      <QuickEntryForm isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<QuickEntryForm isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('contains amount and description inputs', () => {
    renderForm();

    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('calls onSubmit with correct data when form is submitted', () => {
    const { onSubmit } = renderForm();

    const amountInput = screen.getByLabelText(/amount/i);
    const descriptionInput = screen.getByLabelText(/description/i);

    fireEvent.change(amountInput, { target: { value: '12.50' } });
    fireEvent.change(descriptionInput, { target: { value: 'Coffee' } });

    // Submit by clicking the button (form submit)
    const submitButton = screen.getByRole('button', { name: /add transaction/i });
    fireEvent.click(submitButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const callArg = onSubmit.mock.calls[0][0];
    expect(callArg.amount).toEqual({ amount: 1250 });
    expect(callArg.payee).toBe('Coffee');
    expect(callArg.type).toBe('EXPENSE');
  });

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderForm();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles type between Expense and Income', () => {
    renderForm();

    const expenseBtn = screen.getByRole('button', { name: 'Expense' });
    const incomeBtn = screen.getByRole('button', { name: 'Income' });

    // Initially Expense is active
    expect(expenseBtn).toHaveAttribute('aria-pressed', 'true');
    expect(incomeBtn).toHaveAttribute('aria-pressed', 'false');

    // Click Income
    fireEvent.click(incomeBtn);
    expect(incomeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(expenseBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows success feedback after submit', () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Snack' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Success toast should be visible
    expect(screen.getByText('Transaction added')).toBeInTheDocument();
  });

  it('does not submit when amount is empty', () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit when description is empty', () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits Income type when toggled', () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Income' }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Salary' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].type).toBe('INCOME');
  });

  it('has accessible dialog labelling', () => {
    renderForm();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Quick add transaction');
  });

  it('shows date input when "Change date" is clicked', () => {
    renderForm();

    // Date input should not be visible initially
    expect(screen.queryByLabelText(/date/i)).not.toBeInTheDocument();

    // Click "Change date" button
    fireEvent.click(screen.getByRole('button', { name: /change date/i }));

    // Date input should now be visible
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it('resets form fields after successful submission', () => {
    renderForm();

    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    const descriptionInput = screen.getByLabelText(/description/i) as HTMLInputElement;

    fireEvent.change(amountInput, { target: { value: '25' } });
    fireEvent.change(descriptionInput, { target: { value: 'Lunch' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    // After submit, fields should be reset
    expect(amountInput.value).toBe('');
    expect(descriptionInput.value).toBe('');
  });

  it('dismisses success toast after delay', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    expect(screen.getByText('Transaction added')).toBeInTheDocument();

    // Advance timers to dismiss toast
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.queryByText('Transaction added')).not.toBeInTheDocument();
  });
});
