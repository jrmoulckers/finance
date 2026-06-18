// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Transaction } from '../../kmp/bridge';
import { LazyReceiptImage } from './LazyReceiptImage';

const offlineStatusMock = {
  isOffline: false,
  shouldDeferHeavyAssets: false,
};

vi.mock('../../hooks/useOfflineStatus', () => ({
  useOfflineStatus: () => offlineStatusMock,
}));

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(customFields: Record<string, string> | null): Transaction {
  return {
    id: 'transaction-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 1000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Coffee Shop',
    note: null,
    date: '2025-03-06',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
  };
}

describe('LazyReceiptImage', () => {
  beforeEach(() => {
    offlineStatusMock.isOffline = false;
    offlineStatusMock.shouldDeferHeavyAssets = false;
    vi.useRealTimers();
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: class ImmediateIntersectionObserver {
        observe(): void {
          // Leave rows offscreen until tests opt into the fallback path.
        }
        disconnect(): void {}
      },
    });
  });

  it('does not attach an image src until the receipt is near the viewport', () => {
    render(
      <LazyReceiptImage
        transaction={makeTransaction({ receiptThumbnailUrl: '/receipts/r-1.webp' })}
      />,
    );

    expect(screen.getByRole('img', { name: /receipt deferred/i })).toBeInTheDocument();
    expect(screen.queryByAltText(/receipt for coffee shop/i)).not.toBeInTheDocument();
  });

  it('shows pending upload state immediately', () => {
    render(<LazyReceiptImage transaction={makeTransaction({ receiptUploadStatus: 'pending' })} />);

    expect(screen.getByRole('img', { name: /receipt pending upload/i })).toBeInTheDocument();
  });

  it('uses an offline placeholder for remote-only receipts when heavy assets are deferred', () => {
    offlineStatusMock.isOffline = true;
    offlineStatusMock.shouldDeferHeavyAssets = true;

    render(
      <LazyReceiptImage
        transaction={makeTransaction({ receiptThumbnailUrl: '/receipts/r-1.webp' })}
      />,
    );

    expect(screen.getByRole('img', { name: /receipt unavailable offline/i })).toBeInTheDocument();
  });
});
