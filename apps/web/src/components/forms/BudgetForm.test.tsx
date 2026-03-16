// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category } from '../../kmp/bridge';
import { BudgetForm, type BudgetFormProps } from './BudgetForm';

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
    id: 'category-rent',
    householdId: 'household-1',
    name: 'Rent',
    icon: 'home',
    color: '#7C3AED',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 2,
    ...syncMetadata,
  },
];

function renderBudgetForm(overrides: Partial<BudgetFormProps> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <BudgetForm
      isOpen={true}
      onSubmit={onSubmit}
      onCancel={onCancel}
      categories={categories}
      {...overrides}
    />,
  );

  return { onSubmit, onCancel };
}

describe('BudgetForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders form fields when open', () => {
    renderBudgetForm();

    expect(screen.getByRole('dialog', { name: 'Create Budget' })).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByLabelText('Period')).toHaveValue('MONTHLY');
    expect(screen.getByLabelText('Start Date')).toHaveValue('2025-06-01');
    expect(screen.getByRole('button', { name: 'Create Budget' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderBudgetForm({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates required fields on submit', () => {
    const { onSubmit } = renderBudgetForm();

    fireEvent.click(screen.getByRole('button', { name: 'Create Budget' }));

    expect(screen.getByText('Please select a category.')).toBeInTheDocument();
    expect(screen.getByText('Amount must be greater than zero.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with transformed budget data', async () => {
    const { onSubmit } = renderBudgetForm();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'category-food' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '450.25' } });
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: 'YEARLY' } });
    fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2025-07-01' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Budget' }));
    });

    expect(onSubmit).toHaveBeenCalledWith({
      householdId: 'household-1',
      categoryId: 'category-food',
      name: 'Food',
      amount: { amount: 45025 },
      period: 'YEARLY',
      startDate: '2025-07-01',
      endDate: null,
      isRollover: false,
    });
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const { onCancel } = renderBudgetForm();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
