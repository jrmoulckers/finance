// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback } from 'react';

export interface ModalBackdropProps {
  /**
   * Invoked when the backdrop surface itself is clicked (never when a click
   * bubbles up from the dialog panel). Typically closes the modal. Because
   * backdrop-click-to-close is mouse-only, callers MUST still provide
   * Escape-to-close on the dialog panel for keyboard parity (SC 2.1.1).
   */
  onClick?: () => void;
  /** The dialog panel and any other overlay content. */
  children: React.ReactNode;
  /**
   * Class names appended after the base `modal-backdrop` class — typically the
   * consumer's positioning/dim overlay class (e.g. `form-dialog__backdrop`).
   */
  className?: string;
}

/**
 * Shared modal backdrop overlay.
 *
 * Provides one consistent, semantically-correct wrapper behind modal dialogs so
 * the ~20 hand-rolled backdrop `<div>`s across the app stop diverging (some had
 * no `aria-hidden`, some used `role="presentation"`, #3617):
 *
 * - Uses `role="presentation"` because the dialog panel is rendered as a child;
 *   marking the wrapper `aria-hidden` would incorrectly hide the dialog from
 *   assistive technology. The child panel carries `role="dialog"` /
 *   `aria-modal` and its own accessible name.
 * - Only a click on the backdrop surface itself triggers `onClick`; clicks that
 *   originate inside the panel are ignored, so consumers no longer need a
 *   `stopPropagation` handler on the panel.
 *
 * WCAG SC 1.3.1 Info and Relationships, SC 2.1.1 Keyboard.
 */
export const ModalBackdrop = React.forwardRef<HTMLDivElement, ModalBackdropProps>(
  function ModalBackdrop({ onClick, children, className }, ref) {
    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
          onClick?.();
        }
      },
      [onClick],
    );

    return (
      <div
        ref={ref}
        className={className ? `modal-backdrop ${className}` : 'modal-backdrop'}
        role="presentation"
        onClick={handleClick}
      >
        {children}
      </div>
    );
  },
);

export default ModalBackdrop;
