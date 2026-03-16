// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../../db/DatabaseProvider';
import { queryOne } from '../../db/sqlite-wasm';
import { AccountForm, type AccountFormProps } from './AccountForm';

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: vi.fn(),
}));

vi.mock('../../db/sqlite-wasm', () => ({
  queryOne: vi.fn(),
}));

const mockedUseDatabase = vi.mocked(useDatabase);
const mockedQueryOne = vi.mocked(queryOne);
const mockDb = {};

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
    mockedQueryOne.mockReturnValue({ id: 'household-1' } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    expect(screen.getByLabelText('Initial Balance')).toHaveValue(0);

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
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with account data including type and currency', async () => {
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Primary Savings' },
    });
    fireEvent.change(screen.getByLabelText('Account Type'), { target: { value: 'SAVINGS' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByLabelText('Initial Balance'), { target: { value: '125.5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 'household-1',
      name: 'Primary Savings',
      type: 'SAVINGS',
      currency: { code: 'EUR', decimalPlaces: 2 },
      currentBalance: { amount: 12550 },
    });
  });

  it('shows a household error when no household is available', () => {
    mockedQueryOne.mockReturnValue(null);
    const { onSubmit } = renderAccountForm();

    fireEvent.change(screen.getByLabelText('Account Name'), {
      target: { value: 'Householdless Account' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

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
});
