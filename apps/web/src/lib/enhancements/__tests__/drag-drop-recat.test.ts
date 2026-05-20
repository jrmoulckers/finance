import { describe, it, expect } from 'vitest';
import {
  createDropZone,
  createDragDropOperation,
  isValidDrop,
  undoOperation,
  createBatchRecategorization,
  getActiveHistory,
  getFullHistory,
  countRecategorizedTransactions,
  findOperationsForTransaction,
} from '../drag-drop-recat';

describe('drag-drop-recat', () => {
  describe('createDropZone', () => {
    it('creates a drop zone', () => {
      const zone = createDropZone('cat-1', 'Groceries');
      expect(zone.categoryId).toBe('cat-1');
      expect(zone.acceptsTransactions).toBe(true);
    });

    it('creates non-accepting zone', () => {
      const zone = createDropZone('cat-1', 'Locked', false);
      expect(zone.acceptsTransactions).toBe(false);
    });
  });

  describe('createDragDropOperation', () => {
    it('creates operation with undone=false', () => {
      const op = createDragDropOperation(
        'op-1',
        ['tx-1', 'tx-2'],
        'cat-a',
        'cat-b',
        '2025-01-15T00:00:00Z',
      );
      expect(op.transactionIds).toEqual(['tx-1', 'tx-2']);
      expect(op.undone).toBe(false);
    });
  });

  describe('isValidDrop', () => {
    it('returns true for valid drop', () => {
      const zone = createDropZone('cat-b', 'Dining');
      expect(isValidDrop('cat-a', zone)).toBe(true);
    });

    it('returns false when dropping to same category', () => {
      const zone = createDropZone('cat-a', 'Groceries');
      expect(isValidDrop('cat-a', zone)).toBe(false);
    });

    it('returns false when zone does not accept', () => {
      const zone = createDropZone('cat-b', 'Locked', false);
      expect(isValidDrop('cat-a', zone)).toBe(false);
    });
  });

  describe('undoOperation', () => {
    it('marks operation as undone', () => {
      const op = createDragDropOperation('op-1', ['tx-1'], 'a', 'b', '2025-01-15T00:00:00Z');
      const undone = undoOperation(op);
      expect(undone.undone).toBe(true);
    });
  });

  describe('createBatchRecategorization', () => {
    it('creates a single batch operation', () => {
      const ops = createBatchRecategorization(
        'batch-1',
        ['tx-1', 'tx-2', 'tx-3'],
        'cat-a',
        'cat-b',
        '2025-01-15T00:00:00Z',
      );
      expect(ops).toHaveLength(1);
      expect(ops[0].transactionIds).toHaveLength(3);
    });
  });

  describe('getActiveHistory', () => {
    it('excludes undone operations', () => {
      const ops = [
        createDragDropOperation('1', ['tx-1'], 'a', 'b', '2025-01-01T00:00:00Z'),
        {
          ...createDragDropOperation('2', ['tx-2'], 'a', 'c', '2025-01-02T00:00:00Z'),
          undone: true,
        },
      ];
      expect(getActiveHistory(ops)).toHaveLength(1);
    });
  });

  describe('getFullHistory', () => {
    it('sorts by timestamp', () => {
      const ops = [
        createDragDropOperation('2', ['tx-2'], 'a', 'b', '2025-01-02T00:00:00Z'),
        createDragDropOperation('1', ['tx-1'], 'a', 'b', '2025-01-01T00:00:00Z'),
      ];
      const sorted = getFullHistory(ops);
      expect(sorted[0].id).toBe('1');
      expect(sorted[1].id).toBe('2');
    });
  });

  describe('countRecategorizedTransactions', () => {
    it('counts non-undone transactions', () => {
      const ops = [
        createDragDropOperation('1', ['tx-1', 'tx-2'], 'a', 'b', '2025-01-01T00:00:00Z'),
        {
          ...createDragDropOperation('2', ['tx-3'], 'a', 'c', '2025-01-02T00:00:00Z'),
          undone: true,
        },
        createDragDropOperation('3', ['tx-4'], 'b', 'c', '2025-01-03T00:00:00Z'),
      ];
      expect(countRecategorizedTransactions(ops)).toBe(3);
    });
  });

  describe('findOperationsForTransaction', () => {
    it('finds operations containing a transaction', () => {
      const ops = [
        createDragDropOperation('1', ['tx-1', 'tx-2'], 'a', 'b', '2025-01-01T00:00:00Z'),
        createDragDropOperation('2', ['tx-3'], 'a', 'c', '2025-01-02T00:00:00Z'),
      ];
      expect(findOperationsForTransaction(ops, 'tx-1')).toHaveLength(1);
      expect(findOperationsForTransaction(ops, 'tx-99')).toHaveLength(0);
    });
  });
});
