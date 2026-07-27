// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../../db/DatabaseProvider';
import { AccountForm, type AccountFormProps } from './AccountForm';

vi.mock('../../accessibility/aria', () => ({
  announce: vi.fn(),
  useFocusTrap: vi.fn(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: vi.fn(),
}));

const mockedUseDatabase = vi.mocked(useDatabase);
const mockDb = { getOptional: vi.fn() };

function renderAccountForm(overrides: Partial<AccountFormProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();

  render(<AccountForm isOpen={true} onSubmit={onSubmit} onCancel={onCancel} {...overrides} />);

  return { onSubmit, onCancel };
}

describe('AccountForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedUseDatabase.mockReturnValue(mockDb as never);
    mockDb.getOptional.mockResolvedValue({ id: 'household-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders when open and is hidden when closed', () => {
    const { rerender } = render(
      <AccountForm
        isOpen={true}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Account Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Account Type')).toHaveValue('CHECKING');
    expect(screen.getByLabelText('Account Purpose')).toHaveValue('personal');
    expect(
      screen.getByLabelText('Mark this as a retirement or tax-advantaged account'),
    ).not.toBeChecked();
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    expect(screen.getByLabelText('Initial Balance')).toHaveValue('');

    rerender(
      <AccountForm
        isOpen={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates the required account name field', () => {
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(screen.getByText('Account name is required.')).toBeInTheDocument();
    const summary = screen.getByText('Some fields need attention').closest('.form-error-summary');
    expect(summary).toHaveAttribute('tabindex', '-1');
    expect(
      screen.getByRole('link', { name: /Account Name: Account name is required/i }),
    ).toHaveAttribute('href', '#account-name');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with account data including type and currency', async () => {
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Primary Savings' },
    });
    fireEvent.change(screen.getByLabelText('Account Type'), { target: { value: 'SAVINGS' } });
    fireEvent.change(screen.getByLabelText('Account Purpose'), { target: { value: 'business' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByLabelText('Initial Balance'), { target: { value: '125.5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 'household-1',
      name: 'Primary Savings',
      type: 'SAVINGS',
      purpose: 'business',
      retirementAccountType: null,
      retirementTaxTreatment: null,
      hsaCoverageLevel: null,
      currency: { code: 'EUR', decimalPlaces: 2 },
      currentBalance: { amount: 12550 },
    });
  });

  it('submits retirement account classification metadata', async () => {
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Family HSA' },
    });
    fireEvent.click(screen.getByLabelText('Mark this as a retirement or tax-advantaged account'));
    fireEvent.change(screen.getByLabelText('Retirement account type'), {
      target: { value: 'HSA' },
    });
    fireEvent.change(screen.getByLabelText('HSA coverage'), { target: { value: 'FAMILY' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        retirementAccountType: 'HSA',
        retirementTaxTreatment: 'PRE_TAX',
        hsaCoverageLevel: 'FAMILY',
      }),
    );
  });

  it('handles zero-decimal currency balances', async () => {
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Tokyo Cash' },
    });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'JPY' } });
    fireEvent.change(screen.getByLabelText('Initial Balance'), { target: { value: '1250' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: { code: 'JPY', decimalPlaces: 0 },
        currentBalance: { amount: 1250 },
      }),
    );
  });

  it('shows a household error when no household is available', async () => {
    mockDb.getOptional.mockResolvedValue(null);
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Householdless Account' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    });

    expect(
      screen.getByText('No household found. Please create a household before adding accounts.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel', () => {
    const { onCancel } = renderAccountForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('prompts before closing a dirty form', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onCancel } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Primary Checking' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(confirmSpy).toHaveBeenCalledWith('Discard the account changes you have not saved yet?');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
