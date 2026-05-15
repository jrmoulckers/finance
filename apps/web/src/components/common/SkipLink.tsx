// SPDX-License-Identifier: BUSL-1.1

/**
 * SkipLink — Skip to main content link for keyboard navigation.
 *
 * Provides a visually hidden link that becomes visible on focus, allowing
 * keyboard users to skip past navigation and jump directly to the main content.
 * This is a WCAG 2.2 AA requirement (SC 2.4.1 Bypass Blocks).
 *
 * @module components/common/SkipLink
 * References: issue #1341
 */

import React, { useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkipLinkProps {
  /** The ID of the main content element to skip to. Defaults to 'main-content'. */
  targetId?: string;

  /** The visible text for the skip link. Defaults to 'Skip to main content'. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Inline styles (CSP-safe — no inline scripts, styles are React CSSProperties)
// ---------------------------------------------------------------------------

const skipLinkStyles: React.CSSProperties = {
  position: 'absolute',
  top: '-100%',
  left: '16px',
  zIndex: 10000,
  padding: '8px 16px',
  backgroundColor: 'var(--semantic-interactive-default, #2563eb)',
  color: 'var(--color-white, #fff)',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '0.875rem',
  borderRadius: '0 0 8px 8px',
  transition: 'top 0.15s ease',
};

const skipLinkFocusStyles: React.CSSProperties = {
  ...skipLinkStyles,
  top: '0',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Accessible skip-to-main-content link.
 *
 * Renders a link that is hidden off-screen until focused via Tab.
 * On activation, focuses the target element for immediate keyboard access.
 */
export const SkipLink: React.FC<SkipLinkProps> = ({
  targetId = 'main-content',
  label = 'Skip to main content',
}) => {
  const [isFocused, setIsFocused] = React.useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
        // Remove the tabindex after focus so it doesn't persist
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
    },
    [targetId],
  );

  return (
    <a
      href={`#${targetId}`}
      className="skip-link"
      style={isFocused ? skipLinkFocusStyles : skipLinkStyles}
      onClick={handleClick}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {label}
    </a>
  );
};
