// SPDX-License-Identifier: BUSL-1.1

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefCallback,
} from 'react';
import './sortable-list.css';

export interface SortableListItemProps {
  ref: (node: HTMLElement | null) => void;
  className: string;
  'data-sortable-item-id': string;
}

export interface SortableListDragHandleProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref: RefCallback<HTMLButtonElement>;
}

export interface SortableListRenderProps {
  itemProps: SortableListItemProps;
  dragHandleProps: SortableListDragHandleProps;
  isDragging: boolean;
  isDragPreview: boolean;
}

export interface SortableListProps<TItem> {
  items: readonly TItem[];
  getItemId: (item: TItem) => string;
  getItemLabel: (item: TItem) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: TItem, props: SortableListRenderProps) => ReactNode;
  className?: string;
  role?: HTMLAttributes<HTMLDivElement>['role'];
  ariaLabel?: string;
}

interface DragState {
  readonly itemId: string;
  readonly itemLabel: string;
  readonly fromIndex: number;
  readonly dropIndex: number;
  readonly pointerId: number;
  readonly pointerOffsetX: number;
  readonly pointerOffsetY: number;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly previewLeft: number;
  readonly previewTop: number;
}

interface PositionedItem {
  readonly index: number;
  readonly rect: DOMRect;
}

function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function getInsertionIndex(
  positionedItems: readonly PositionedItem[],
  clientX: number,
  clientY: number,
): number {
  const hasSharedRows = positionedItems.some((item, index) => {
    if (index === 0) {
      return false;
    }

    return Math.abs(item.rect.top - positionedItems[index - 1].rect.top) < 4;
  });

  for (const item of positionedItems) {
    const midpointY = item.rect.top + item.rect.height / 2;
    const midpointX = item.rect.left + item.rect.width / 2;

    if (clientY < midpointY) {
      return item.index;
    }

    if (
      hasSharedRows &&
      clientY >= item.rect.top &&
      clientY <= item.rect.bottom &&
      clientX < midpointX
    ) {
      return item.index;
    }
  }

  return positionedItems.length;
}

export function SortableList<TItem>({
  items,
  getItemId,
  getItemLabel,
  onReorder,
  renderItem,
  className,
  role = 'list',
  ariaLabel,
}: SortableListProps<TItem>) {
  const instructionsId = useId();
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusId = useRef<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const visibleItems = useMemo(() => {
    if (dragState === null) {
      return items.map((item, index) => ({ item, index }));
    }

    return items.reduce<Array<{ item: TItem; index: number }>>((result, item, index) => {
      if (index !== dragState.fromIndex) {
        result.push({ item, index });
      }
      return result;
    }, []);
  }, [dragState, items]);

  useEffect(() => {
    if (pendingFocusId.current === null) {
      return;
    }

    const handle = handleRefs.current.get(pendingFocusId.current);
    if (handle) {
      handle.focus();
      pendingFocusId.current = null;
    }
  }, [items]);

  useEffect(() => {
    if (dragState === null) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      event.preventDefault();

      setDragState((current) => {
        if (current === null || current.pointerId !== event.pointerId) {
          return current;
        }

        const positionedItems = items.reduce<PositionedItem[]>((result, item, index) => {
          if (index === current.fromIndex) {
            return result;
          }

          const element = itemRefs.current.get(getItemId(item));
          if (!element) {
            return result;
          }

          result.push({
            index: result.length,
            rect: element.getBoundingClientRect(),
          });
          return result;
        }, []);

        return {
          ...current,
          dropIndex: getInsertionIndex(positionedItems, event.clientX, event.clientY),
          previewLeft: event.clientX - current.pointerOffsetX,
          previewTop: event.clientY - current.pointerOffsetY,
        };
      });
    };

    const finalizeDrag = (event: PointerEvent) => {
      setDragState((current) => {
        if (current === null || current.pointerId !== event.pointerId) {
          return current;
        }

        pendingFocusId.current = current.itemId;

        if (current.fromIndex !== current.dropIndex) {
          onReorder(current.fromIndex, current.dropIndex);
          setAnnouncement(
            `${current.itemLabel} moved to position ${current.dropIndex + 1} of ${items.length}.`,
          );
        }

        return null;
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finalizeDrag);
    window.addEventListener('pointercancel', finalizeDrag);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finalizeDrag);
      window.removeEventListener('pointercancel', finalizeDrag);
    };
  }, [dragState, getItemId, items, onReorder]);

  const registerItemRef = useCallback((itemId: string, node: HTMLElement | null) => {
    if (node) {
      itemRefs.current.set(itemId, node);
    } else {
      itemRefs.current.delete(itemId);
    }
  }, []);

  const registerHandleRef = useCallback((itemId: string, node: HTMLButtonElement | null) => {
    if (node) {
      handleRefs.current.set(itemId, node);
    } else {
      handleRefs.current.delete(itemId);
    }
  }, []);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, index: number, item: TItem) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const itemId = getItemId(item);
      const element = itemRefs.current.get(itemId);
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      event.preventDefault();
      event.currentTarget.focus();

      setDragState({
        itemId,
        itemLabel: getItemLabel(item),
        fromIndex: index,
        dropIndex: index,
        pointerId: event.pointerId,
        pointerOffsetX: event.clientX - rect.left,
        pointerOffsetY: event.clientY - rect.top,
        previewWidth: rect.width,
        previewHeight: rect.height,
        previewLeft: rect.left,
        previewTop: rect.top,
      });
    },
    [getItemId, getItemLabel],
  );

  const handleKeyboardReorder = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number, item: TItem) => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
        return;
      }

      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = Math.min(Math.max(index + direction, 0), items.length - 1);
      if (nextIndex === index) {
        return;
      }

      const itemId = getItemId(item);
      pendingFocusId.current = itemId;
      onReorder(index, nextIndex);
      setAnnouncement(
        `${getItemLabel(item)} moved to position ${nextIndex + 1} of ${items.length}.`,
      );
    },
    [getItemId, getItemLabel, items.length, onReorder],
  );

  const renderSortableItem = useCallback(
    (item: TItem, index: number, options?: { isDragPreview?: boolean }) => {
      const itemId = getItemId(item);
      const itemProps: SortableListItemProps = {
        ref: (node) => registerItemRef(itemId, node),
        className: joinClassNames(
          'sortable-list__item',
          options?.isDragPreview && 'sortable-list__item--preview',
        ),
        'data-sortable-item-id': itemId,
      };

      const dragHandleProps: SortableListDragHandleProps = {
        type: 'button',
        ref: (node) => registerHandleRef(itemId, node),
        className: 'sortable-list__drag-handle',
        'aria-label': `Reorder ${getItemLabel(item)}`,
        'aria-describedby': instructionsId,
        'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown',
        onPointerDown: (event) => startDrag(event, index, item),
        onKeyDown: (event) => handleKeyboardReorder(event, index, item),
        disabled: items.length < 2,
      };

      return renderItem(item, {
        itemProps,
        dragHandleProps,
        isDragging: dragState?.itemId === itemId,
        isDragPreview: options?.isDragPreview === true,
      });
    },
    [
      dragState?.itemId,
      getItemId,
      getItemLabel,
      handleKeyboardReorder,
      instructionsId,
      items.length,
      registerHandleRef,
      registerItemRef,
      renderItem,
      startDrag,
    ],
  );

  const draggedItem = dragState ? items[dragState.fromIndex] : null;
  const listChildren: ReactNode[] = [];

  visibleItems.forEach(({ item, index: originalIndex }, visibleIndex) => {
    if (dragState && dragState.dropIndex === visibleIndex) {
      listChildren.push(
        <div
          key="sortable-placeholder"
          className="sortable-list__placeholder"
          aria-hidden="true"
          style={{
            minHeight: dragState.previewHeight,
            width: dragState.previewWidth,
          }}
        />,
      );
    }

    listChildren.push(
      <Fragment key={getItemId(item)}>{renderSortableItem(item, originalIndex)}</Fragment>,
    );
  });

  if (dragState && dragState.dropIndex === visibleItems.length) {
    listChildren.push(
      <div
        key="sortable-placeholder"
        className="sortable-list__placeholder"
        aria-hidden="true"
        style={{
          minHeight: dragState.previewHeight,
          width: dragState.previewWidth,
        }}
      />,
    );
  }

  return (
    <>
      <div
        className={joinClassNames('sortable-list', className)}
        role={role}
        aria-label={ariaLabel}
      >
        <span id={instructionsId} className="sr-only">
          Drag a handle to reorder this list, or press Alt plus the arrow keys while a handle is
          focused.
        </span>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
        {listChildren}
      </div>
      {dragState && draggedItem ? (
        <div
          className="sortable-list__preview"
          aria-hidden="true"
          style={{
            width: dragState.previewWidth,
            transform: `translate3d(${dragState.previewLeft}px, ${dragState.previewTop}px, 0)`,
          }}
        >
          {renderSortableItem(draggedItem, dragState.fromIndex, { isDragPreview: true })}
        </div>
      ) : null}
    </>
  );
}

export default SortableList;
