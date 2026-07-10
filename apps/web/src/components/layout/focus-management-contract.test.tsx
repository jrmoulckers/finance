// SPDX-License-Identifier: BUSL-1.1

/**
 * Representative focus-management contract test (#3631, WCAG SC 2.4.3).
 *
 * Exercises the documented "dialog close → invoking control" leg of the focus
 * contract end to end with the real `useFocusTrap` implementation (not mocked),
 * complementing `FocusManager.test.tsx` (route change) and
 * `useFocusTrap.test.ts` (hook-level unit coverage).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ConfirmDialog } from '../common/ConfirmDialog';

/**
 * Minimal flow matching the contract: an invoking control opens a dialog, and
 * closing the dialog must return focus to that control.
 */
function DialogFlow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <ConfirmDialog
        isOpen={open}
        title="Delete account?"
        message="This action cannot be undone."
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('focus-management contract (#3631, SC 2.4.3)', () => {
  it('moves focus into the dialog on open and restores it to the invoker on close', () => {
    render(<DialogFlow />);

    const opener = screen.getByRole('button', { name: 'Open dialog' });
    opener.focus();
    expect(document.activeElement).toBe(opener);

    // Open: focus is trapped and lands on the Cancel control (initialFocusRef).
    fireEvent.click(opener);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);

    // Close: focus returns to the invoking control.
    fireEvent.click(cancel);
    expect(document.activeElement).toBe(opener);
  });
});
