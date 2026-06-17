// SPDX-License-Identifier: BUSL-1.1

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '../../kmp/bridge';
import {
  CategoryDropZone,
  DragDropProvider,
  DraggableTransaction,
  TRANSACTION_DRAG_MIME_TYPE,
  useDragDropContext,
} from './DragDropContext';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

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
    id: 'category-utilities',
    householdId: 'household-1',
    name: 'Utilities',
    icon: 'bolt',
    color: '#7C3AED',
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 2,
    ...syncMetadata,
  },
];

function createMockDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
    getData: vi.fn((type: string) => data.get(type) ?? ''),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

function DragStateProbe() {
  const { activeDrag, activeDropTargetId, successDropTargetId, returningTransactionIds } =
    useDragDropContext();

  return (
    <div>
      <output data-testid="active-count">{activeDrag?.transactionIds.length ?? 0}</output>
      <output data-testid="active-target">{activeDropTargetId ?? ''}</output>
      <output data-testid="success-target">{successDropTargetId ?? ''}</output>
      <output data-testid="returning-count">{Array.from(returningTransactionIds).join(',')}</output>
    </div>
  );
}

describe('DragDropContext', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes transaction ids into dataTransfer and tracks active drag state', () => {
    const dataTransfer = createMockDataTransfer();

    render(
      <DragDropProvider>
        <DragStateProbe />
        <DraggableTransaction
          transactionId="transaction-1"
          label="Grocery Store"
          dragTransactionIds={['transaction-1', 'transaction-2']}
          data-testid="draggable-transaction"
        >
          <div>Transaction row</div>
        </DraggableTransaction>
      </DragDropProvider>,
    );

    fireEvent.dragStart(screen.getByTestId('draggable-transaction'), { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      TRANSACTION_DRAG_MIME_TYPE,
      expect.stringContaining('transaction-1'),
    );
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '2 transactions');
    expect(dataTransfer.setDragImage).toHaveBeenCalled();
    expect(screen.getByTestId('active-count')).toHaveTextContent('2');
  });

  it('highlights drop targets and flashes success after a completed drop', () => {
    const dataTransfer = createMockDataTransfer();
    const onDropTransactions = vi.fn(() => true);

    render(
      <DragDropProvider>
        <DragStateProbe />
        <DraggableTransaction
          transactionId="transaction-1"
          label="Grocery Store"
          dragTransactionIds={['transaction-1', 'transaction-2']}
          data-testid="draggable-transaction"
        >
          <div>Transaction row</div>
        </DraggableTransaction>
        <CategoryDropZone categories={categories} onDropTransactions={onDropTransactions} />
      </DragDropProvider>,
    );

    fireEvent.dragStart(screen.getByTestId('draggable-transaction'), { dataTransfer });

    const utilitiesZone = screen
      .getByText('Utilities')
      .closest('[data-drop-target-id="category-utilities"]');
    expect(utilitiesZone).not.toBeNull();

    fireEvent.dragOver(utilitiesZone!, { dataTransfer });
    expect(utilitiesZone).toHaveAttribute('data-drop-state', 'over');
    expect(screen.getByTestId('active-target')).toHaveTextContent('category-utilities');

    fireEvent.drop(utilitiesZone!, { dataTransfer });

    expect(onDropTransactions).toHaveBeenCalledWith(
      ['transaction-1', 'transaction-2'],
      'category-utilities',
      'Utilities',
    );
    expect(utilitiesZone).toHaveAttribute('data-drop-state', 'success');
    expect(screen.getByTestId('success-target')).toHaveTextContent('category-utilities');
  });

  it('marks dragged transactions as returning when a drag ends without a drop', () => {
    vi.useFakeTimers();
    const dataTransfer = createMockDataTransfer();

    render(
      <DragDropProvider>
        <DragStateProbe />
        <DraggableTransaction
          transactionId="transaction-1"
          label="Grocery Store"
          data-testid="draggable-transaction"
        >
          <div>Transaction row</div>
        </DraggableTransaction>
      </DragDropProvider>,
    );

    fireEvent.dragStart(screen.getByTestId('draggable-transaction'), { dataTransfer });
    fireEvent.dragEnd(screen.getByTestId('draggable-transaction'));

    expect(screen.getByTestId('returning-count')).toHaveTextContent('transaction-1');

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByTestId('returning-count')).toHaveTextContent('');
  });
});
