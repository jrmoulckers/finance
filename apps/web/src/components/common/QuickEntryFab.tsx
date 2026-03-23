// SPDX-License-Identifier: BUSL-1.1

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import '../../styles/quick-entry.css';

/** Props for {@link QuickEntryFab}. */
export interface QuickEntryFabProps {
  /** Callback invoked when the FAB is activated (click or keyboard shortcut). */
  onOpen: () => void;
}

/**
 * Floating action button for quick transaction entry.
 *
 * Renders a fixed-position "+" button at the bottom-right of the viewport.
 * Positioned above the bottom navigation bar on mobile.
 *
 * The global "N" keyboard shortcut is handled by the parent ({@link AppLayout})
 * so the FAB itself only responds to direct click / Enter / Space activation.
 */
export function QuickEntryFab({ onOpen }: QuickEntryFabProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <button
      type="button"
      className="quick-entry-fab"
      aria-label="Quick add transaction"
      aria-keyshortcuts="n"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <span className="quick-entry-fab__icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>
    </button>
  );
}

export default QuickEntryFab;
