// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Account, Category } from '../../kmp/bridge';
import { VoiceEntrySheet } from './VoiceEntrySheet';

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

const syncMetadata = {
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

const accounts: Account[] = [
  {
    id: 'checking',
    householdId: 'household-1',
    name: 'Checking',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 0 },
    isArchived: false,
    sortOrder: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncMetadata,
  },
];

const categories: Category[] = [
  {
    id: 'groceries',
    householdId: 'household-1',
    name: 'Groceries',
    icon: 'cart',
    color: '#16A34A',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
    ...syncMetadata,
  },
];

describe('VoiceEntrySheet', () => {
  it('shows a graceful fallback when the Web Speech API is unavailable', () => {
    const onRequestManualEntry = vi.fn();

    render(
      <VoiceEntrySheet
        isOpen={true}
        accounts={accounts}
        categories={categories}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onRequestManualEntry={onRequestManualEntry}
      />,
    );

    expect(screen.getByRole('dialog', { name: /voice transaction entry/i })).toBeInTheDocument();
    expect(screen.getByText(/does not expose the web speech api/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /use manual entry instead/i }));
    expect(onRequestManualEntry).toHaveBeenCalledTimes(1);
  });
});
