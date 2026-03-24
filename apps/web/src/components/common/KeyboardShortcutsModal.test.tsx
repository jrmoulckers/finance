// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/aria', () => ({
  useFocusTrap: vi.fn(),
}));

import { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

describe('KeyboardShortcutsModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dialog when open', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<KeyboardShortcutsModal isOpen={false} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays the title "Keyboard shortcuts"', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
  });

  it('displays the description text', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    expect(
      screen.getByText(/shortcuts work when focus is outside text fields/i),
    ).toBeInTheDocument();
  });

  it('renders a shortcuts table with header columns', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    expect(within(table).getByRole('columnheader', { name: 'Shortcut' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Action' })).toBeInTheDocument();
  });

  it('renders kbd elements for keyboard shortcut keys', () => {
    const { container } = render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    const kbdElements = container.querySelectorAll('kbd');
    expect(kbdElements.length).toBeGreaterThanOrEqual(2);

    const kbdTexts = Array.from(kbdElements).map((el) => el.textContent);
    expect(kbdTexts).toContain('?');
    expect(kbdTexts).toContain('Esc');
  });

  it('renders a Close button', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('calls onClose when the Close button is clicked', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<KeyboardShortcutsModal isOpen={true} onClose={onClose} />);

    const backdrop = container.querySelector('.form-dialog__backdrop');
    expect(backdrop).toBeInTheDocument();

    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has proper ARIA labelling on the dialog', () => {
    render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Keyboard shortcuts');

    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /shortcuts work when focus is outside text fields/i,
    );
  });

  it('hides the backdrop from assistive technology', () => {
    const { container } = render(<KeyboardShortcutsModal isOpen={true} onClose={vi.fn()} />);

    const backdrop = container.querySelector('.form-dialog__backdrop');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
  });
});
