// SPDX-License-Identifier: BUSL-1.1

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

import type { Category, SyncId } from '../../kmp/bridge';

import './drag-drop-context.css';

export const TRANSACTION_DRAG_MIME_TYPE = 'application/x.finance.transactions+json';
export const UNCATEGORIZED_DROP_TARGET_ID = '__uncategorized__';
const DROP_SUCCESS_FLASH_MS = 900;
const DRAG_RETURN_ANIMATION_MS = 280;

export interface TransactionDragPayload {
  transactionIds: SyncId[];
  primaryTransactionId: SyncId;
  label: string;
}

interface DragDropContextValue {
  activeDrag: TransactionDragPayload | null;
  activeDropTargetId: string | null;
  successDropTargetId: string | null;
  returningTransactionIds: ReadonlySet<SyncId>;
  isDragging: boolean;
  beginDrag: (payload: TransactionDragPayload) => void;
  setActiveDropTarget: (targetId: string | null) => void;
  completeDrop: (targetId: string) => void;
  finishDrag: () => void;
  cancelDrag: () => void;
}

const DragDropContext = createContext<DragDropContextValue | null>(null);

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function createDragPreview(label: string, count: number): HTMLDivElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const preview = document.createElement('div');
  preview.className = 'drag-drop-preview';

  const labelElement = document.createElement('span');
  labelElement.className = 'drag-drop-preview__label';
  labelElement.textContent = label;
  preview.appendChild(labelElement);

  if (count > 1) {
    const badge = document.createElement('span');
    badge.className = 'drag-drop-preview__count';
    badge.textContent = `${count}`;
    preview.appendChild(badge);
  }

  document.body.appendChild(preview);
  return preview;
}

export function writeTransactionDragPayload(
  dataTransfer: DataTransfer | null,
  payload: TransactionDragPayload,
): void {
  if (!dataTransfer) {
    return;
  }

  const serializedPayload = JSON.stringify(payload);
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData(TRANSACTION_DRAG_MIME_TYPE, serializedPayload);
  dataTransfer.setData(
    'text/plain',
    payload.transactionIds.length > 1
      ? `${payload.transactionIds.length} transactions`
      : payload.label,
  );
}

export function readTransactionDragPayload(
  dataTransfer: Pick<DataTransfer, 'getData'> | null,
): TransactionDragPayload | null {
  if (!dataTransfer) {
    return null;
  }

  const rawPayload = dataTransfer.getData(TRANSACTION_DRAG_MIME_TYPE);
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as Partial<TransactionDragPayload>;
    if (
      !Array.isArray(parsed.transactionIds) ||
      typeof parsed.primaryTransactionId !== 'string' ||
      typeof parsed.label !== 'string'
    ) {
      return null;
    }

    const transactionIds = parsed.transactionIds.filter(
      (transactionId): transactionId is SyncId =>
        typeof transactionId === 'string' && transactionId.length > 0,
    );
    if (transactionIds.length === 0) {
      return null;
    }

    return {
      transactionIds,
      primaryTransactionId: parsed.primaryTransactionId,
      label: parsed.label,
    };
  } catch {
    return null;
  }
}

export interface DragDropProviderProps {
  children: ReactNode;
}

export function DragDropProvider({ children }: DragDropProviderProps) {
  const [activeDrag, setActiveDrag] = useState<TransactionDragPayload | null>(null);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null>(null);
  const [successDropTargetId, setSuccessDropTargetId] = useState<string | null>(null);
  const [returningTransactionIds, setReturningTransactionIds] = useState<Set<SyncId>>(new Set());

  const lastDragPayloadRef = useRef<TransactionDragPayload | null>(null);
  const dropCompletedRef = useRef(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSuccessTimer = useCallback(() => {
    if (successTimerRef.current !== null) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const clearReturnTimer = useCallback(() => {
    if (returnTimerRef.current !== null) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearSuccessTimer();
      clearReturnTimer();
    };
  }, [clearReturnTimer, clearSuccessTimer]);

  const beginDrag = useCallback(
    (payload: TransactionDragPayload) => {
      clearSuccessTimer();
      clearReturnTimer();
      dropCompletedRef.current = false;
      lastDragPayloadRef.current = payload;
      setSuccessDropTargetId(null);
      setReturningTransactionIds(new Set());
      setActiveDropTargetId(null);
      setActiveDrag(payload);
    },
    [clearReturnTimer, clearSuccessTimer],
  );

  const completeDrop = useCallback(
    (targetId: string) => {
      clearSuccessTimer();
      dropCompletedRef.current = true;
      setActiveDrag(null);
      setActiveDropTargetId(targetId);
      setSuccessDropTargetId(targetId);
      successTimerRef.current = setTimeout(() => {
        setSuccessDropTargetId(null);
        setActiveDropTargetId(null);
        lastDragPayloadRef.current = null;
      }, DROP_SUCCESS_FLASH_MS);
    },
    [clearSuccessTimer],
  );

  const finishDrag = useCallback(() => {
    const payload = activeDrag ?? lastDragPayloadRef.current;

    setActiveDrag(null);
    setActiveDropTargetId(null);

    if (dropCompletedRef.current) {
      dropCompletedRef.current = false;
      return;
    }

    const transactionIds = payload?.transactionIds ?? [];
    if (transactionIds.length === 0) {
      lastDragPayloadRef.current = null;
      return;
    }

    clearReturnTimer();
    setReturningTransactionIds(new Set(transactionIds));
    lastDragPayloadRef.current = null;
    returnTimerRef.current = setTimeout(() => {
      setReturningTransactionIds(new Set());
    }, DRAG_RETURN_ANIMATION_MS);
  }, [activeDrag, clearReturnTimer]);

  const cancelDrag = useCallback(() => {
    dropCompletedRef.current = false;
    lastDragPayloadRef.current = null;
    setActiveDrag(null);
    setActiveDropTargetId(null);
  }, []);

  const value = useMemo<DragDropContextValue>(
    () => ({
      activeDrag,
      activeDropTargetId,
      successDropTargetId,
      returningTransactionIds,
      isDragging: activeDrag !== null,
      beginDrag,
      setActiveDropTarget: setActiveDropTargetId,
      completeDrop,
      finishDrag,
      cancelDrag,
    }),
    [
      activeDrag,
      activeDropTargetId,
      successDropTargetId,
      returningTransactionIds,
      beginDrag,
      completeDrop,
      finishDrag,
      cancelDrag,
    ],
  );

  return <DragDropContext.Provider value={value}>{children}</DragDropContext.Provider>;
}

export function useDragDropContext(): DragDropContextValue {
  const value = useContext(DragDropContext);
  if (value === null) {
    throw new Error('useDragDropContext must be used within a DragDropProvider');
  }
  return value;
}

export interface DraggableTransactionProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onDragStart' | 'onDragEnd'
> {
  transactionId: SyncId;
  label: string;
  dragTransactionIds?: readonly SyncId[];
  disabled?: boolean;
  children: ReactNode;
}

export function DraggableTransaction({
  transactionId,
  label,
  dragTransactionIds,
  disabled = false,
  children,
  className,
  ...rest
}: DraggableTransactionProps) {
  const { activeDrag, returningTransactionIds, beginDrag, finishDrag } = useDragDropContext();
  const activeDragIds = activeDrag?.transactionIds ?? [];
  const isDragged = activeDragIds.includes(transactionId);
  const isReturning = returningTransactionIds.has(transactionId);

  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }

      const transactionIds = Array.from(new Set(dragTransactionIds ?? [transactionId]));
      const payload: TransactionDragPayload = {
        transactionIds,
        primaryTransactionId: transactionId,
        label,
      };

      beginDrag(payload);
      writeTransactionDragPayload(event.dataTransfer, payload);

      const preview = createDragPreview(label, transactionIds.length);
      if (preview !== null && event.dataTransfer) {
        event.dataTransfer.setDragImage(preview, 18, 18);
        setTimeout(() => preview.remove(), 0);
      }
    },
    [beginDrag, disabled, dragTransactionIds, label, transactionId],
  );

  const handleDragEnd = useCallback(() => {
    finishDrag();
  }, [finishDrag]);

  return (
    <div
      {...rest}
      className={joinClassNames(
        'drag-drop-transaction',
        isDragged && 'drag-drop-transaction--dragging',
        isReturning && 'drag-drop-transaction--returning',
        className,
      )}
      draggable={!disabled}
      data-drag-state={isDragged ? 'dragging' : isReturning ? 'returning' : 'idle'}
      aria-grabbed={isDragged || undefined}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
    </div>
  );
}

export interface CategoryDropZoneProps {
  categories: readonly Category[];
  onDropTransactions: (
    transactionIds: readonly SyncId[],
    categoryId: SyncId | null,
    categoryName: string,
  ) => boolean;
}

interface DropTargetDefinition {
  id: SyncId | null;
  name: string;
  color: string | null;
  targetId: string;
}

export function CategoryDropZone({ categories, onDropTransactions }: CategoryDropZoneProps) {
  const {
    activeDrag,
    activeDropTargetId,
    successDropTargetId,
    isDragging,
    setActiveDropTarget,
    completeDrop,
    cancelDrag,
  } = useDragDropContext();

  const dropTargets = useMemo<DropTargetDefinition[]>(
    () => [
      {
        id: null,
        name: 'Uncategorized',
        color: null,
        targetId: UNCATEGORIZED_DROP_TARGET_ID,
      },
      ...categories.map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color,
        targetId: category.id,
      })),
    ],
    [categories],
  );

  const isPanelVisible = isDragging || successDropTargetId !== null;
  const draggedCount = activeDrag?.transactionIds.length ?? 0;

  const resolvePayload = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) =>
      activeDrag ?? readTransactionDragPayload(event.dataTransfer),
    [activeDrag],
  );

  const handleDragOver = useCallback(
    (targetId: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      if (resolvePayload(event) === null) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (activeDropTargetId !== targetId) {
        setActiveDropTarget(targetId);
      }
    },
    [activeDropTargetId, resolvePayload, setActiveDropTarget],
  );

  const handleDragLeave = useCallback(
    (targetId: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      if (
        activeDropTargetId === targetId &&
        !event.currentTarget.contains(event.relatedTarget as Node | null)
      ) {
        setActiveDropTarget(null);
      }
    },
    [activeDropTargetId, setActiveDropTarget],
  );

  const handleDrop = useCallback(
    (target: DropTargetDefinition) => (event: ReactDragEvent<HTMLDivElement>) => {
      const payload = resolvePayload(event);
      if (payload === null) {
        return;
      }

      event.preventDefault();
      const wasSuccessful = onDropTransactions(payload.transactionIds, target.id, target.name);
      if (wasSuccessful) {
        completeDrop(target.targetId);
      } else {
        cancelDrag();
      }
    },
    [cancelDrag, completeDrop, onDropTransactions, resolvePayload],
  );

  return (
    <aside
      className={joinClassNames(
        'drag-drop-category-panel',
        isPanelVisible && 'drag-drop-category-panel--visible',
      )}
      aria-hidden={!isPanelVisible}
      aria-label="Transaction recategorization drop targets"
    >
      <p className="drag-drop-category-panel__eyebrow">Drop to recategorize</p>
      <h3 className="drag-drop-category-panel__title">
        {draggedCount > 1 ? `Move ${draggedCount} transactions` : 'Move transaction'}
      </h3>
      <p className="drag-drop-category-panel__description">
        Drop onto a category, or use the Category bulk action for keyboard-friendly
        recategorization.
      </p>

      <div className="drag-drop-category-panel__targets" role="list">
        {dropTargets.map((target) => {
          const zoneState =
            successDropTargetId === target.targetId
              ? 'success'
              : activeDropTargetId === target.targetId
                ? 'over'
                : 'idle';
          const zoneStyle = {
            '--drag-drop-zone-color': target.color ?? '#64748b',
          } as CSSProperties;

          return (
            <div
              key={target.targetId}
              role="listitem"
              className={joinClassNames(
                'drag-drop-category-zone',
                zoneState === 'over' && 'drag-drop-category-zone--over',
                zoneState === 'success' && 'drag-drop-category-zone--success',
              )}
              data-drop-target-id={target.targetId}
              data-drop-state={zoneState}
              style={zoneStyle}
              onDragOver={handleDragOver(target.targetId)}
              onDragLeave={handleDragLeave(target.targetId)}
              onDrop={handleDrop(target)}
            >
              <span className="drag-drop-category-zone__swatch" aria-hidden="true" />
              <div className="drag-drop-category-zone__content">
                <span className="drag-drop-category-zone__label">{target.name}</span>
                <span className="drag-drop-category-zone__hint">Drop here</span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
