// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortableList } from './SortableList';

function TestList({ onReorder }: { onReorder: (fromIndex: number, toIndex: number) => void }) {
  return (
    <SortableList
      items={[
        { id: 'alpha', label: 'Alpha' },
        { id: 'bravo', label: 'Bravo' },
        { id: 'charlie', label: 'Charlie' },
      ]}
      getItemId={(item) => item.id}
      getItemLabel={(item) => item.label}
      onReorder={onReorder}
      ariaLabel="Test sortable list"
      renderItem={(item, { itemProps, dragHandleProps }) => (
        <div {...itemProps} className={`${itemProps.className} test-sortable-item`}>
          <button {...dragHandleProps}>⋮⋮</button>
          <span>{item.label}</span>
        </div>
      )}
    />
  );
}

describe('SortableList', () => {
  it('supports keyboard reordering with Alt+Arrow keys', () => {
    const onReorder = vi.fn();
    render(<TestList onReorder={onReorder} />);

    fireEvent.keyDown(screen.getAllByRole('button', { name: /reorder/i })[0], {
      key: 'ArrowDown',
      altKey: true,
    });

    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });

  it('does not reorder past the list boundary with keyboard shortcuts', () => {
    const onReorder = vi.fn();
    render(<TestList onReorder={onReorder} />);

    fireEvent.keyDown(screen.getAllByRole('button', { name: /reorder/i })[0], {
      key: 'ArrowUp',
      altKey: true,
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reorders items with pointer drag and drop', () => {
    const onReorder = vi.fn();
    render(<TestList onReorder={onReorder} />);

    const items = Array.from(document.querySelectorAll('[data-sortable-item-id]')) as HTMLElement[];
    items.forEach((item, index) => {
      item.getBoundingClientRect = vi.fn(() => ({
        x: 0,
        y: index * 60,
        width: 320,
        height: 48,
        top: index * 60,
        right: 320,
        bottom: index * 60 + 48,
        left: 0,
        toJSON: () => ({}),
      })) as typeof item.getBoundingClientRect;
    });

    const [alphaHandle] = screen.getAllByRole('button', { name: /reorder/i });
    fireEvent.pointerDown(alphaHandle, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 16,
      clientY: 24,
      button: 0,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 16,
      clientY: 150,
    });
    fireEvent.pointerUp(window, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 16,
      clientY: 150,
    });

    expect(onReorder).toHaveBeenCalledWith(0, 2);
  });
});
