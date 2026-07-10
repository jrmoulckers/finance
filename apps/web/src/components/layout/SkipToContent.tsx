// SPDX-License-Identifier: BUSL-1.1

import { type FC, type KeyboardEvent, useCallback } from 'react';

export interface SkipToContentProps {
  targetId?: string;
  label?: string;
  /**
   * Optional custom resolver for the focus target. When provided it takes
   * precedence over `targetId`, letting a single skip link point at whichever
   * landmark is currently visible (e.g. the desktop sidebar vs. the mobile
   * bottom navigation). Return `null` to fall back to the `targetId` lookup.
   */
  resolveTarget?: () => HTMLElement | null;
}

export const SkipToContent: FC<SkipToContentProps> = ({
  targetId = 'main-content',
  label = 'Skip to main content',
  resolveTarget,
}) => {
  const moveFocusToTarget = useCallback(() => {
    const target =
      resolveTarget?.() ??
      document.getElementById(targetId) ??
      document.querySelector<HTMLElement>('main');

    if (!target) return;

    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }

    target.focus();
  }, [resolveTarget, targetId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLAnchorElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        moveFocusToTarget();
      }
    },
    [moveFocusToTarget],
  );

  return (
    <a
      href={`#${targetId}`}
      className="skip-link"
      onClick={(e) => {
        e.preventDefault();
        moveFocusToTarget();
      }}
      onKeyDown={handleKeyDown}
    >
      {label}
    </a>
  );
};
