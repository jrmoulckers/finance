// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for TransactionFilters component.
 * References: issue #1464
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { TransactionFilters, EMPTY_FILTERS, countActiveFilters } from './TransactionFilters';
import type { AdvancedFilters } from './TransactionFilters';
import type { Account, Category } from '../../kmp/bridge';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

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
  {
    id: 'cat-2',
    householdId: 'h1',
    name: 'Transport',
    icon: null,
    color: null,
    parentId: null,
    sortOrder: 1,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  },
] as unknown as Category[];

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransactionFilters', () => {
  it('renders toggle button with correct label', () => {
    render(
      <TransactionFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        isOpen={false}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('shows badge when filters are active', () => {
    const filtersWithType: AdvancedFilters = { ...EMPTY_FILTERS, types: ['EXPENSE'] };
    render(
      <TransactionFilters
        filters={filtersWithType}
        onChange={vi.fn()}
        isOpen={false}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('calls onToggle when toggle button is clicked', () => {
    const onToggle = vi.fn();
    render(
      <TransactionFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        isOpen={false}
        onToggle={onToggle}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders the panel when isOpen is true', () => {
    render(
      <TransactionFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        isOpen={true}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    expect(screen.getByRole('region', { name: /advanced filters/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/from date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to date/i)).toBeInTheDocument();
  });

  it('does not render the panel when isOpen is false', () => {
    render(
      <TransactionFilters
        filters={EMPTY_FILTERS}
        onChange={vi.fn()}
        isOpen={false}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    expect(screen.queryByRole('region', { name: /advanced filters/i })).not.toBeInTheDocument();
  });

  it('calls onChange when a type toggle is clicked', () => {
    const onChange = vi.fn();
    render(
      <TransactionFilters
        filters={EMPTY_FILTERS}
        onChange={onChange}
        isOpen={true}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /expense/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ types: ['EXPENSE'] }));
  });

  it('shows active filter chips and allows removal', () => {
    const onChange = vi.fn();
    const filtersWithDate: AdvancedFilters = { ...EMPTY_FILTERS, startDate: '2024-01-01' };
    render(
      <TransactionFilters
        filters={filtersWithDate}
        onChange={onChange}
        isOpen={false}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    expect(screen.getByText(/from: 2024-01-01/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/remove filter/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ startDate: '' }));
  });

  it('shows clear all button when filters are active', () => {
    const onChange = vi.fn();
    const filtersWithType: AdvancedFilters = { ...EMPTY_FILTERS, types: ['INCOME'] };
    render(
      <TransactionFilters
        filters={filtersWithType}
        onChange={onChange}
        isOpen={true}
        onToggle={vi.fn()}
        categories={mockCategories}
        accounts={mockAccounts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS);
  });
});

describe('countActiveFilters', () => {
  it('returns 0 for empty filters', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts each active filter dimension', () => {
    const filters: AdvancedFilters = {
      ...EMPTY_FILTERS,
      startDate: '2024-01-01',
      types: ['EXPENSE'],
      amountMin: '10',
    };
    expect(countActiveFilters(filters)).toBe(3);
  });
});
