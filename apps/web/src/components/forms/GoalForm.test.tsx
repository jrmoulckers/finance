// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDatabase } from '../../db/DatabaseProvider';
import { queryOne } from '../../db/sqlite-wasm';
import { GoalForm, type GoalFormProps } from './GoalForm';

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
    mockedQueryOne.mockReturnValue({ id: 'household-1' } as never);
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
    expect(screen.getByLabelText('Current Amount')).toHaveValue(0);
    expect(screen.getByLabelText('Target Date')).toHaveAttribute('min', '2025-06-16');
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
    fireEvent.change(screen.getByLabelText('Target Date'), { target: { value: '2025-06-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));

    expect(screen.getByText('Target date must be in the future.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
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
      targetAmount: { amount: 100025 },
      currentAmount: { amount: 25010 },
      targetDate: '2025-07-01',
      status: 'ACTIVE',
    });
  });

  it('shows a household error when no household is available', () => {
    mockedQueryOne.mockReturnValue(null);
    const { onSubmit } = renderGoalForm();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Car' } });
    fireEvent.change(screen.getByLabelText('Target Amount'), { target: { value: '7500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Goal' }));

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
