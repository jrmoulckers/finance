// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export interface UseKeyboardShortcutsResult {
  showHelp: boolean;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

/** Handle global keyboard shortcuts for help and modal dismissal. */
export function useKeyboardShortcuts(): UseKeyboardShortcutsResult {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHelp(false);
        return;
      }

      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setShowHelp(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { showHelp, setShowHelp };
}
