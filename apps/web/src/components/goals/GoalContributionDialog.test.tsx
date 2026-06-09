// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Goal } from '../../kmp/bridge';
import { MoneyDisplayProvider } from '../../lib/display-settings';
import { GoalContributionDialog } from './GoalContributionDialog';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    householdId: 'household-1',
    name: 'Emergency Fund',
    description: 'Keep three months saved.',
    targetAmount: { amount: 100000 },
    currentAmount: { amount: 25000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    targetDate: '2025-12-31',
    status: 'ACTIVE',
    icon: 'shield',
    color: '#059669',
    accountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

function renderDialog(
  props: Partial<ComponentProps<typeof GoalContributionDialog>> = {},
  goal = makeGoal(),
) {
  const onSubmit = vi.fn<NonNullable<ComponentProps<typeof GoalContributionDialog>['onSubmit']>>();
  const onCancel = vi.fn();

  render(
    <MoneyDisplayProvider>
      <GoalContributionDialog
        isOpen
        goal={goal}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </MoneyDisplayProvider>,
  );

  return { onSubmit, onCancel };
}

describe('GoalContributionDialog', () => {
  it('submits a positive contribution with an optional note', async () => {
    const { onSubmit, onCancel } = renderDialog();

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '125.50' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Paycheck transfer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        goalId: 'goal-1',
        amount: { amount: 12550 },
        note: 'Paycheck transfer',
      });
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('shows a validation error when the amount is not positive', async () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a positive contribution amount.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks for confirmation before contributing past the goal target', async () => {
    const goal = makeGoal({ currentAmount: { amount: 95000 } });
    const { onSubmit } = renderDialog({}, goal);

    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      screen.getByRole('alertdialog', { name: 'Contribution exceeds goal' }),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Still Contribute' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        goalId: 'goal-1',
        amount: { amount: 10000 },
        note: null,
      });
    });
  });
});
