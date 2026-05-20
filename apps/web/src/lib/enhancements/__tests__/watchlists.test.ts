import { describe, it, expect } from 'vitest';
import {
  createWatchlist,
  addItem,
  removeItem,
  reorderItem,
  calculateDropPosition,
  filterByCategory,
  exportList,
  getItemById,
} from '../watchlists';

describe('watchlists', () => {
  describe('createWatchlist', () => {
    it('creates an empty watchlist', () => {
      const list = createWatchlist('wl-1', 'My Stocks', 'stocks');
      expect(list.id).toBe('wl-1');
      expect(list.name).toBe('My Stocks');
      expect(list.category).toBe('stocks');
      expect(list.items).toHaveLength(0);
    });
  });

  describe('addItem', () => {
    it('adds item with auto position', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'Apple' });
      list = addItem(list, { id: 'i-2', label: 'Google' });
      expect(list.items).toHaveLength(2);
      expect(list.items[0].position).toBe(0);
      expect(list.items[1].position).toBe(1);
    });
  });

  describe('removeItem', () => {
    it('removes item and re-indexes', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'A' });
      list = addItem(list, { id: 'i-2', label: 'B' });
      list = addItem(list, { id: 'i-3', label: 'C' });
      list = removeItem(list, 'i-2');
      expect(list.items).toHaveLength(2);
      expect(list.items[0].id).toBe('i-1');
      expect(list.items[0].position).toBe(0);
      expect(list.items[1].id).toBe('i-3');
      expect(list.items[1].position).toBe(1);
    });
  });

  describe('reorderItem', () => {
    it('moves item from position 0 to 2', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'A' });
      list = addItem(list, { id: 'i-2', label: 'B' });
      list = addItem(list, { id: 'i-3', label: 'C' });
      list = reorderItem(list, 0, 2);
      expect(list.items[0].id).toBe('i-2');
      expect(list.items[1].id).toBe('i-3');
      expect(list.items[2].id).toBe('i-1');
    });

    it('returns original for invalid indices', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'A' });
      const result = reorderItem(list, -1, 0);
      expect(result).toBe(list);
    });

    it('returns original when from === to', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'A' });
      expect(reorderItem(list, 0, 0)).toBe(list);
    });
  });

  describe('calculateDropPosition', () => {
    it('returns midpoint between two positions', () => {
      expect(calculateDropPosition(2, 4)).toBe(3);
    });

    it('returns after - 1 when no before', () => {
      expect(calculateDropPosition(null, 5)).toBe(4);
    });

    it('returns before + 1 when no after', () => {
      expect(calculateDropPosition(3, null)).toBe(4);
    });

    it('returns 0 when both null', () => {
      expect(calculateDropPosition(null, null)).toBe(0);
    });
  });

  describe('filterByCategory', () => {
    it('filters lists by category', () => {
      const lists = [
        createWatchlist('1', 'Stocks', 'stocks'),
        createWatchlist('2', 'Goals', 'goals'),
        createWatchlist('3', 'More Stocks', 'stocks'),
      ];
      expect(filterByCategory(lists, 'stocks')).toHaveLength(2);
    });
  });

  describe('exportList', () => {
    it('exports labels in order', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'Zebra' });
      list = addItem(list, { id: 'i-2', label: 'Alpha' });
      const exported = exportList(list);
      expect(exported).toEqual(['Zebra', 'Alpha']);
    });
  });

  describe('getItemById', () => {
    it('finds item by id', () => {
      let list = createWatchlist('wl-1', 'Test', 'custom');
      list = addItem(list, { id: 'i-1', label: 'Found' });
      expect(getItemById(list, 'i-1')?.label).toBe('Found');
    });

    it('returns undefined for missing id', () => {
      const list = createWatchlist('wl-1', 'Test', 'custom');
      expect(getItemById(list, 'missing')).toBeUndefined();
    });
  });
});
