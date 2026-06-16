// SPDX-License-Identifier: BUSL-1.1

import { type FC, type KeyboardEvent, useCallback } from 'react';

export interface SkipToContentProps {
  targetId?: string;
  label?: string;
}

export const SkipToContent: FC<SkipToContentProps> = ({
  targetId = 'main-content',
  label = 'Skip to main content',
}) => {
  const moveFocusToTarget = useCallback(() => {
    const target = document.getElementById(targetId) ?? document.querySelector<HTMLElement>('main');

    if (!target) return;

    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
    }

    target.focus();
  }, [targetId]);

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
