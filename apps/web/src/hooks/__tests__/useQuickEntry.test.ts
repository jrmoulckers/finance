// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useQuickEntry } from '../useQuickEntry';

// Hoisted mock function — available inside vi.mock factories
const mockCreateTransaction = vi.fn().mockReturnValue({ id: 'txn-1' });

// Mock all dependent hooks
vi.mock('../useAccounts', () => ({
  useAccounts: () => ({
    accounts: [
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
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}));

vi.mock('../useCategories', () => ({
  useCategories: () => ({
    categories: [
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
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  }),
}));

vi.mock('../useTransactions', () => ({
  useTransactions: () => ({
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: (...args: unknown[]) => mockCreateTransaction(...args),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  }),
}));

vi.mock('../useAutoCategory', () => ({
  useAutoCategory: () => ({
    suggestCategory: vi.fn().mockReturnValue(null),
    learnCorrection: vi.fn(),
  }),
}));

describe('useQuickEntry', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useQuickEntry());
    expect(result.current.isOpen).toBe(false);
  });

  it('opens on open()', () => {
    const { result } = renderHook(() => useQuickEntry());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it('closes on close()', () => {
    const { result } = renderHook(() => useQuickEntry());
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('toggles open/close', () => {
    const { result } = renderHook(() => useQuickEntry());
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it('exposes accounts from useAccounts', () => {
    const { result } = renderHook(() => useQuickEntry());
    expect(result.current.accounts.length).toBe(1);
    expect(result.current.accounts[0].id).toBe('acc-1');
  });

  it('exposes categories from useCategories', () => {
    const { result } = renderHook(() => useQuickEntry());
    expect(result.current.categories.length).toBe(1);
    expect(result.current.categories[0].id).toBe('cat-1');
  });

  it('submitTransaction calls createTransaction', () => {
    const { result } = renderHook(() => useQuickEntry());

    act(() => {
      result.current.submitTransaction({
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE',
        amount: { amount: 500 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: 'Coffee',
        date: '2025-01-15',
        categoryId: null,
        note: null,
      });
    });

    expect(mockCreateTransaction).toHaveBeenCalledOnce();
  });

  it('error is null after successful submission', () => {
    const { result } = renderHook(() => useQuickEntry());

    act(() => {
      result.current.submitTransaction({
        householdId: 'hh-1',
        accountId: 'acc-1',
        type: 'EXPENSE',
        amount: { amount: 500 },
        currency: { code: 'USD', decimalPlaces: 2 },
        payee: 'Coffee',
        date: '2025-01-15',
        categoryId: null,
        note: null,
      });
    });

    expect(result.current.error).toBeNull();
  });

  it('registers keyboard shortcut n to open', () => {
    const { result } = renderHook(() => useQuickEntry());

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('does not trigger shortcut when modifier keys are pressed', () => {
    const { result } = renderHook(() => useQuickEntry());

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }));
    });

    expect(result.current.isOpen).toBe(false);
  });
});
