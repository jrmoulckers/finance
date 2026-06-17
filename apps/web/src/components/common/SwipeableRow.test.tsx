// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SwipeableRow, type SwipeAction } from './SwipeableRow';

function setRowWidth(element: HTMLElement, width = 300) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width,
      height: 64,
      top: 20,
      left: 10,
      right: 10 + width,
      bottom: 84,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }),
  });
}

function renderRow(options: { leftActions?: SwipeAction[]; rightActions?: SwipeAction[] } = {}) {
  const leftHandler = vi.fn();
  const rightHandler = vi.fn();

  const leftActions = options.leftActions ?? [
    {
      id: 'delete',
      label: 'Delete',
      onAction: leftHandler,
      variant: 'danger' as const,
    },
  ];

  const rightActions = options.rightActions ?? [
    {
      id: 'categorize',
      label: 'Categorize',
      onAction: rightHandler,
      variant: 'success' as const,
      quick: true,
    },
  ];

  const view = render(
    <SwipeableRow
      data-testid="swipeable-row"
      aria-label="Transaction row actions"
      leftActions={leftActions}
      rightActions={rightActions}
    >
      <div>Weekly groceries</div>
    </SwipeableRow>,
  );

  const row = screen.getByTestId('swipeable-row');
  setRowWidth(row);

  return {
    ...view,
    row,
    leftHandler,
    rightHandler,
    content: row.querySelector('.swipeable-row__content') as HTMLDivElement,
  };
}

describe('SwipeableRow', () => {
  const originalPointerEvent = window.PointerEvent;

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    window.PointerEvent = originalPointerEvent;
    vi.restoreAllMocks();
  });

  it('springs back when released before the threshold', () => {
    const { row, content, rightHandler } = renderRow();

    fireEvent.pointerDown(content, { pointerId: 1, clientX: 40, clientY: 20, button: 0 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 100, clientY: 22 });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 100, clientY: 22 });

    expect(rightHandler).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('translateX(0px)');
    expect(row.className).not.toContain('swipeable-row--open-right');
  });

  it('reveals left-side actions after a large left swipe', () => {
    const { row, content, leftHandler } = renderRow();

    fireEvent.pointerDown(content, { pointerId: 1, clientX: 240, clientY: 20, button: 0 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 120, clientY: 20 });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 120, clientY: 20 });

    expect(row.className).toContain('swipeable-row--open-left');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(leftHandler).toHaveBeenCalledTimes(1);
  });

  it('triggers the quick right action after crossing the threshold', () => {
    const { content, rightHandler } = renderRow();

    fireEvent.pointerDown(content, { pointerId: 1, clientX: 48, clientY: 18, button: 0 });
    fireEvent.pointerMove(content, { pointerId: 1, clientX: 170, clientY: 18 });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 170, clientY: 18 });

    expect(rightHandler).toHaveBeenCalledTimes(1);
    expect(content.style.transform).toBe('translateX(0px)');
  });

  it('opens the accessible context menu on right click', () => {
    const { row, leftHandler } = renderRow();

    fireEvent.contextMenu(row, { clientX: 64, clientY: 44 });

    expect(screen.getByRole('menu', { name: 'Row actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(leftHandler).toHaveBeenCalledTimes(1);
  });

  it('supports the touch-event fallback when pointer events are unavailable', () => {
    // @ts-expect-error test override
    window.PointerEvent = undefined;
    const { rightHandler, content } = renderRow();

    fireEvent.touchStart(content, {
      touches: [{ clientX: 32, clientY: 16 }],
    });
    fireEvent.touchMove(content, {
      touches: [{ clientX: 160, clientY: 16 }],
    });
    fireEvent.touchEnd(content);

    expect(rightHandler).toHaveBeenCalledTimes(1);
  });
});
