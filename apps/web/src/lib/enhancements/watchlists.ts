/**
 * Reorderable watchlists and tracked lists.
 * Closes #1638.
 * @module enhancements/watchlists
 */

import type { Watchlist, WatchlistItem, WatchlistCategory } from './types';

/**
 * Create a new empty watchlist.
 * @param id - Unique identifier
 * @param name - Display name
 * @param category - List category
 * @returns A new empty watchlist
 */
export function createWatchlist(id: string, name: string, category: WatchlistCategory): Watchlist {
  return { id, name, category, items: [] };
}

/**
 * Add an item to the end of a watchlist.
 * @param list - The watchlist
 * @param item - Item to add (position will be set automatically)
 * @returns Updated watchlist with the new item appended
 */
export function addItem(list: Watchlist, item: Omit<WatchlistItem, 'position'>): Watchlist {
  const position = list.items.length;
  const newItem: WatchlistItem = { ...item, position };
  return { ...list, items: [...list.items, newItem] };
}

/**
 * Remove an item from a watchlist by id, re-indexing positions.
 * @param list - The watchlist
 * @param itemId - ID of the item to remove
 * @returns Updated watchlist without the specified item
 */
export function removeItem(list: Watchlist, itemId: string): Watchlist {
  const filtered = list.items.filter((i) => i.id !== itemId);
  const reindexed = filtered.map((item, idx) => ({ ...item, position: idx }));
  return { ...list, items: reindexed };
}

/**
 * Reorder an item from one position to another.
 * @param list - The watchlist
 * @param fromIndex - Current position index
 * @param toIndex - Target position index
 * @returns Updated watchlist with reordered items, or original if indices are invalid
 */
export function reorderItem(list: Watchlist, fromIndex: number, toIndex: number): Watchlist {
  if (
    fromIndex < 0 ||
    fromIndex >= list.items.length ||
    toIndex < 0 ||
    toIndex >= list.items.length ||
    fromIndex === toIndex
  ) {
    return list;
  }

  const items = [...list.items];
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  const reindexed = items.map((item, idx) => ({ ...item, position: idx }));
  return { ...list, items: reindexed };
}

/**
 * Calculate the position for a drag-to-reorder between two items.
 * Returns the midpoint position for fractional ordering.
 * Falls back to integer positions when either neighbor is absent.
 * @param before - Position of the item above the drop point (or `null` if dropping at the top)
 * @param after - Position of the item below the drop point (or `null` if dropping at the bottom)
 * @returns Computed position value
 */
export function calculateDropPosition(before: number | null, after: number | null): number {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - 1;
  if (after === null) return before + 1;
  return Math.floor((before + after) / 2) || before + 1;
}

/**
 * Filter watchlists by category.
 * @param lists - All watchlists
 * @param category - Desired category
 * @returns Watchlists matching the category
 */
export function filterByCategory(
  lists: readonly Watchlist[],
  category: WatchlistCategory,
): readonly Watchlist[] {
  return lists.filter((l) => l.category === category);
}

/**
 * Export a watchlist as a plain JSON-serializable object (labels only).
 * @param list - The watchlist to export
 * @returns Array of label strings in order
 */
export function exportList(list: Watchlist): readonly string[] {
  return [...list.items].sort((a, b) => a.position - b.position).map((i) => i.label);
}

/**
 * Get an item by its id.
 * @param list - The watchlist
 * @param itemId - Item ID
 * @returns The item or `undefined`
 */
export function getItemById(list: Watchlist, itemId: string): WatchlistItem | undefined {
  return list.items.find((i) => i.id === itemId);
}
