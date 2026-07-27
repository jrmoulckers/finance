// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../../db/DatabaseProvider';
import { useAccounts } from '../../hooks/useAccounts';
import { GoalForm, type GoalFormProps } from './GoalForm';

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: vi.fn(),
}));

vi.mock('../../hooks/useAccounts', () => ({
  useAccounts: vi.fn(),
}));

const mockedUseDatabase = vi.mocked(useDatabase);
const mockedUseAccounts = vi.mocked(useAccounts);
const mockDb = { getOptional: vi.fn() };

function renderGoalForm(overrides: Partial<GoalFormProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();

  render(<GoalForm isOpen={true} onSubmit={onSubmit} onCancel={onCancel} {...overrides} />);

  return { onSubmit, onCancel };
}

describe('GoalForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    mockedUseDatabase.mockReturnValue(mockDb as never);
    mockDb.getOptional.mockResolvedValue({ id: 'household-1' });
    mockedUseAccounts.mockReturnValue({
      accounts: [
        { id: 'acct-1', name: 'Joint Checking', isArchived: false },
        { id: 'acct-2', name: 'Personal Savings', isArchived: false },
        { id: 'acct-3', name: 'Closed Card', isArchived: true },
      ],
      loading: false,
      error: null,
      refresh: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders form fields', () => {
    renderGoalForm();

    expect(screen.getByRole('dialog', { name: 'Create Goal' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Target Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Current Amount')).toHaveValue('');
    expect(screen.getByLabelText('Target Date')).toHaveAttribute('min', '2025-06-16');
    expect(screen.getByLabelText('Funding Account')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('validates required fields and future target dates', () => {
    const { onSubmit } = renderGoalForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));

    expect(screen.getByText('Goal name is required.')).toBeInTheDocument();
    expect(screen.getByText('Target amount must be greater than zero.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Vacation' } });
    fireEvent.change(screen.getByLabelText('Target Amount'), { target: { value: '5000' } });
  });

  it('calls onSubmit with transformed goal data', async () => {
    const { onSubmit } = renderGoalForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Emergency Fund' } });
    fireEvent.change(screen.getByLabelText('Target Amount'), { target: { value: '1000.25' } });
    fireEvent.change(screen.getByLabelText('Current Amount'), { target: { value: '250.1' } });
    fireEvent.change(screen.getByLabelText('Target Date'), { target: { value: '2025-07-01' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Keep three months of expenses saved.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 'household-1',
      name: 'Emergency Fund',
      description: 'Keep three months of expenses saved.',
      targetAmount: { amount: 100025 },
      currentAmount: { amount: 25010 },
      targetDate: '2025-07-01',
      accountId: null,
      status: 'ACTIVE',
    });
  });

  it('excludes archived accounts and links the selected funding account', async () => {
    const { onSubmit } = renderGoalForm();

    expect(screen.queryByRole('option', { name: 'Closed Card' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'House Down Payment' } });
    fireEvent.change(screen.getByLabelText('Target Amount'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Funding Account'), { target: { value: 'acct-1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'House Down Payment', accountId: 'acct-1' }),
    );
  });

  it('prefills the description when editing an existing goal', () => {
    renderGoalForm({
      initialData: {
        id: 'goal-1',
        householdId: 'household-1',
        name: 'Emergency Fund',
        description: 'Keep three months of expenses saved.',
        targetAmount: { amount: 100000 },
        currentAmount: { amount: 25000 },
        currency: { code: 'USD', decimalPlaces: 2 },
        targetDate: '2025-07-01',
        status: 'ACTIVE',
        icon: null,
        color: null,
        accountId: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        deletedAt: null,
        syncVersion: 1,
        isSynced: true,
      },
    });

    expect(screen.getByLabelText('Description')).toHaveValue(
      'Keep three months of expenses saved.',
    );
  });

  it('shows a household error when no household is available', async () => {
    mockDb.getOptional.mockResolvedValue(null);
    const { onSubmit } = renderGoalForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Car' } });
    fireEvent.change(screen.getByLabelText('Target Amount'), { target: { value: '7500' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));
    });

    expect(
      screen.getByText('No household found. Please create a household before saving goals.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel', () => {
    const { onCancel } = renderGoalForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
