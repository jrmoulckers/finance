// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ModalBackdrop } from './ModalBackdrop';

describe('ModalBackdrop', () => {
  it('renders children and exposes them to assistive tech (no aria-hidden)', () => {
    render(
      <ModalBackdrop>
        <div role="dialog" aria-label="Example">
          Panel
        </div>
      </ModalBackdrop>,
    );

    // The dialog child must remain reachable — a wrapper aria-hidden would hide it.
    expect(screen.getByRole('dialog', { name: 'Example' })).toBeInTheDocument();
  });

  it('uses role="presentation" and the base class plus any provided class', () => {
    const { container } = render(
      <ModalBackdrop className="form-dialog__backdrop">
        <div>Panel</div>
      </ModalBackdrop>,
    );

    const backdrop = container.querySelector('.modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop).toHaveAttribute('role', 'presentation');
    expect(backdrop).toHaveClass('form-dialog__backdrop');
  });

  it('invokes onClick when the backdrop surface itself is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <ModalBackdrop onClick={onClick}>
        <button type="button">Inside</button>
      </ModalBackdrop>,
    );

    fireEvent.click(container.querySelector('.modal-backdrop') as HTMLElement);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onClick when a click originates inside the panel', () => {
    const onClick = vi.fn();
    render(
      <ModalBackdrop onClick={onClick}>
        <button type="button">Inside</button>
      </ModalBackdrop>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Inside' }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
