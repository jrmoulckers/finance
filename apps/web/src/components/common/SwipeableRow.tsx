// SPDX-License-Identifier: BUSL-1.1

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import './swipeable-row.css';

export type SwipeActionVariant = 'default' | 'success' | 'warning' | 'danger';

export interface SwipeAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onAction: () => void | Promise<void>;
  variant?: SwipeActionVariant;
  quick?: boolean;
  disabled?: boolean;
}

export interface SwipeableRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  leftActions?: readonly SwipeAction[];
  rightActions?: readonly SwipeAction[];
  contentClassName?: string;
  activationThreshold?: number;
  actionWidth?: number;
  longPressDuration?: number;
  disabled?: boolean;
}

type OpenSide = 'left' | 'right' | null;

type GestureSource = 'pointer' | 'touch';

interface GestureState {
  source: GestureSource;
  startX: number;
  startY: number;
  baseOffset: number;
  rowWidth: number;
  dragging: boolean;
}

interface MenuState {
  x: number;
  y: number;
}

const DRAG_START_THRESHOLD = 8;
const DEFAULT_ACTION_WIDTH = 84;

function supportsPointerEvents(): boolean {
  return typeof window !== 'undefined' && typeof window.PointerEvent === 'function';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isPrimaryPointerButton(event: ReactPointerEvent<HTMLDivElement>): boolean {
  return event.pointerType !== 'mouse' || event.button === 0;
}

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  className,
  contentClassName,
  activationThreshold = 0.3,
  actionWidth = DEFAULT_ACTION_WIDTH,
  longPressDuration = 550,
  disabled = false,
  role,
  onContextMenu,
  onKeyDown,
  ...rest
}: SwipeableRowProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<GestureState | null>(null);
  const offsetRef = useRef(0);
  const suppressClickRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();

  const [offsetX, setOffsetX] = useState(0);
  const [openSide, setOpenSide] = useState<OpenSide>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [menuState, setMenuState] = useState<MenuState | null>(null);

  const setOffset = useCallback((value: number) => {
    offsetRef.current = value;
    setOffsetX(value);
  }, []);

  const enabledLeftActions = useMemo(
    () => leftActions.filter((action) => !action.disabled),
    [leftActions],
  );
  const enabledRightActions = useMemo(
    () => rightActions.filter((action) => !action.disabled),
    [rightActions],
  );

  const contextMenuActions = useMemo(() => {
    const deduped = new Map<string, SwipeAction>();

    [...enabledRightActions, ...enabledLeftActions].forEach((action) => {
      if (!deduped.has(action.id)) {
        deduped.set(action.id, action);
      }
    });

    return Array.from(deduped.values());
  }, [enabledLeftActions, enabledRightActions]);

  const leftRevealWidth = enabledLeftActions.length * actionWidth;
  const rightRevealWidth = enabledRightActions.length * actionWidth;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const closeRow = useCallback(() => {
    setOpenSide(null);
    setOffset(0);
    setIsDragging(false);
  }, [setOffset]);

  const openContextMenu = useCallback(
    (x: number, y: number) => {
      if (contextMenuActions.length === 0 || disabled) {
        return;
      }

      setMenuState({ x, y });
      closeRow();
    },
    [closeRow, contextMenuActions.length, disabled],
  );

  const runAction = useCallback(
    (action: SwipeAction) => {
      clearLongPressTimer();
      suppressClickRef.current = true;
      setMenuState(null);
      closeRow();
      void Promise.resolve(action.onAction());
    },
    [clearLongPressTimer, closeRow],
  );

  useEffect(() => {
    if (menuState === null) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuState(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuState(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState]);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  const settleGesture = useCallback(
    (rowWidth: number) => {
      const finalOffset = offsetRef.current;
      const absOffset = Math.abs(finalOffset);
      const thresholdPx = rowWidth * activationThreshold;

      if (finalOffset < 0 && enabledLeftActions.length > 0 && absOffset >= thresholdPx) {
        setOpenSide('left');
        setOffset(-leftRevealWidth);
        return;
      }

      if (finalOffset > 0 && enabledRightActions.length > 0 && absOffset >= thresholdPx) {
        const quickAction =
          enabledRightActions.find((action) => action.quick) ?? enabledRightActions[0];

        if (quickAction.quick ?? true) {
          runAction(quickAction);
          return;
        }

        setOpenSide('right');
        setOffset(rightRevealWidth);
        return;
      }

      closeRow();
    },
    [
      activationThreshold,
      closeRow,
      enabledLeftActions,
      enabledRightActions,
      leftRevealWidth,
      rightRevealWidth,
      runAction,
      setOffset,
    ],
  );

  const beginGesture = useCallback(
    (clientX: number, clientY: number, source: GestureSource) => {
      if (disabled) {
        return;
      }

      clearLongPressTimer();
      setMenuState(null);

      const rowWidth = rootRef.current?.getBoundingClientRect().width ?? 0;
      const baseOffset =
        openSide === 'left' ? -leftRevealWidth : openSide === 'right' ? rightRevealWidth : 0;

      dragRef.current = {
        source,
        startX: clientX,
        startY: clientY,
        baseOffset,
        rowWidth,
        dragging: false,
      };

      if (contextMenuActions.length > 0) {
        longPressTimerRef.current = setTimeout(() => {
          const rect = rootRef.current?.getBoundingClientRect();
          const fallbackX = rect ? rect.left + rect.width / 2 : clientX;
          const fallbackY = rect ? rect.top + rect.height / 2 : clientY;
          dragRef.current = null;
          openContextMenu(fallbackX, fallbackY);
        }, longPressDuration);
      }
    },
    [
      clearLongPressTimer,
      contextMenuActions.length,
      disabled,
      leftRevealWidth,
      longPressDuration,
      openContextMenu,
      openSide,
      rightRevealWidth,
    ],
  );

  const updateGesture = useCallback(
    (clientX: number, clientY: number) => {
      const gesture = dragRef.current;
      if (!gesture) {
        return;
      }

      const deltaX = clientX - gesture.startX;
      const deltaY = clientY - gesture.startY;

      if (
        !gesture.dragging &&
        Math.abs(deltaY) > Math.abs(deltaX) &&
        Math.abs(deltaY) > DRAG_START_THRESHOLD
      ) {
        clearLongPressTimer();
        dragRef.current = null;
        return;
      }

      if (!gesture.dragging && Math.abs(deltaX) < DRAG_START_THRESHOLD) {
        return;
      }

      gesture.dragging = true;
      clearLongPressTimer();
      setIsDragging(true);
      setOpenSide(null);

      const horizontalLimit = Math.max(
        leftRevealWidth,
        rightRevealWidth,
        gesture.rowWidth * activationThreshold,
      );

      setOffset(
        clamp(
          gesture.baseOffset + deltaX,
          -Math.min(horizontalLimit + 24, gesture.rowWidth * 0.85 || horizontalLimit + 24),
          Math.min(horizontalLimit + 24, gesture.rowWidth * 0.85 || horizontalLimit + 24),
        ),
      );
    },
    [activationThreshold, clearLongPressTimer, leftRevealWidth, rightRevealWidth, setOffset],
  );

  const endGesture = useCallback(() => {
    const gesture = dragRef.current;
    clearLongPressTimer();
    dragRef.current = null;

    if (!gesture) {
      setIsDragging(false);
      return;
    }

    if (!gesture.dragging) {
      setIsDragging(false);
      return;
    }

    suppressClickRef.current = true;
    setIsDragging(false);
    settleGesture(gesture.rowWidth);
  }, [clearLongPressTimer, settleGesture]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPrimaryPointerButton(event) || disabled) {
        return;
      }

      beginGesture(event.clientX, event.clientY, 'pointer');

      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Ignore environments that do not fully implement pointer capture.
        }
      }
    },
    [beginGesture, disabled],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.source !== 'pointer') {
        return;
      }

      updateGesture(event.clientX, event.clientY);
    },
    [updateGesture],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.source !== 'pointer') {
        return;
      }

      if (typeof event.currentTarget.releasePointerCapture === 'function') {
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore environments that do not fully implement pointer capture.
        }
      }

      endGesture();
    },
    [endGesture],
  );

  const handlePointerCancel = useCallback(() => {
    if (dragRef.current?.source !== 'pointer') {
      return;
    }

    closeRow();
    clearLongPressTimer();
    dragRef.current = null;
    setIsDragging(false);
  }, [clearLongPressTimer, closeRow]);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (supportsPointerEvents()) {
        return;
      }

      const touch = event.touches[0];
      if (!touch || disabled) {
        return;
      }

      beginGesture(touch.clientX, touch.clientY, 'touch');
    },
    [beginGesture, disabled],
  );

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (dragRef.current?.source !== 'touch') {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      updateGesture(touch.clientX, touch.clientY);
    },
    [updateGesture],
  );

  const handleTouchEnd = useCallback(() => {
    if (dragRef.current?.source !== 'touch') {
      return;
    }

    endGesture();
  }, [endGesture]);

  const handleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    }
  }, []);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      onContextMenu?.(event);
      if (event.defaultPrevented || contextMenuActions.length === 0 || disabled) {
        return;
      }

      event.preventDefault();
      openContextMenu(event.clientX, event.clientY);
    },
    [contextMenuActions.length, disabled, onContextMenu, openContextMenu],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || contextMenuActions.length === 0 || disabled) {
        return;
      }

      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        const rect = rootRef.current?.getBoundingClientRect();
        openContextMenu(rect?.left ?? 0, rect?.bottom ?? 0);
      }
    },
    [contextMenuActions.length, disabled, onKeyDown, openContextMenu],
  );

  const rootClassName = joinClassNames(
    'swipeable-row',
    isDragging && 'swipeable-row--dragging',
    openSide === 'left' && 'swipeable-row--open-left',
    openSide === 'right' && 'swipeable-row--open-right',
    className,
  );

  const contentClasses = joinClassNames('swipeable-row__content', contentClassName);
  const actionHint = contextMenuActions.length > 0 ? `${hintId}-hint` : undefined;

  return (
    <div
      {...rest}
      ref={rootRef}
      className={rootClassName}
      role={role ?? 'group'}
      aria-describedby={actionHint}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
    >
      {(enabledLeftActions.length > 0 || enabledRightActions.length > 0) && (
        <div className="swipeable-row__actions" aria-hidden={openSide === null && !isDragging}>
          {enabledRightActions.length > 0 && (
            <div className="swipeable-row__action-strip swipeable-row__action-strip--right">
              {enabledRightActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={joinClassNames(
                    'swipeable-row__action',
                    `swipeable-row__action--${action.variant ?? 'default'}`,
                  )}
                  style={{ width: `${actionWidth}px` }}
                  onClick={() => runAction(action)}
                  tabIndex={openSide === 'right' ? 0 : -1}
                >
                  {action.icon && <span className="swipeable-row__action-icon">{action.icon}</span>}
                  <span className="swipeable-row__action-label">{action.label}</span>
                </button>
              ))}
            </div>
          )}
          {enabledLeftActions.length > 0 && (
            <div className="swipeable-row__action-strip swipeable-row__action-strip--left">
              {enabledLeftActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={joinClassNames(
                    'swipeable-row__action',
                    `swipeable-row__action--${action.variant ?? 'default'}`,
                  )}
                  style={{ width: `${actionWidth}px` }}
                  onClick={() => runAction(action)}
                  tabIndex={openSide === 'left' ? 0 : -1}
                >
                  {action.icon && <span className="swipeable-row__action-icon">{action.icon}</span>}
                  <span className="swipeable-row__action-label">{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className={contentClasses}
        style={{ transform: `translateX(${offsetX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>

      {contextMenuActions.length > 0 && (
        <span id={actionHint} className="sr-only">
          Swipe horizontally, right-click, or long-press to access transaction actions.
        </span>
      )}

      {menuState !== null && (
        <div
          className="swipeable-row__menu"
          role="menu"
          aria-label="Row actions"
          style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }}
        >
          {contextMenuActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={joinClassNames(
                'swipeable-row__menu-item',
                `swipeable-row__menu-item--${action.variant ?? 'default'}`,
              )}
              role="menuitem"
              onClick={() => runAction(action)}
            >
              {action.icon && <span className="swipeable-row__menu-icon">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SwipeableRow;
