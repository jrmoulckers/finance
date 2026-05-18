// SPDX-License-Identifier: BUSL-1.1

/**
 * ResponsiveNav — Navigation component that adapts to viewport size.
 *
 * - Mobile (< 768px): bottom tab bar with icons
 * - Tablet (768px–1023px): collapsible sidebar
 * - Desktop (>= 1024px): full sidebar with labels
 *
 * Implements proper ARIA attributes including aria-current for active page,
 * aria-expanded for collapsible state, and keyboard focus management.
 *
 * @module components/navigation/ResponsiveNav
 * References: issue #1336
 */

import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useBreakpoint } from '../../hooks/useBreakpoint';

import './responsive-nav.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single navigation item definition. */
export interface NavItem {
  /** Unique identifier for the nav item. */
  id: string;

  /** Visible label text. */
  label: string;

  /** Target route path. */
  href: string;

  /** Icon element (typically an SVG). */
  icon: React.ReactNode;
}

export interface ResponsiveNavProps {
  /** Navigation items to render. */
  items: NavItem[];

  /** The currently active route path. */
  activePath: string;

  /** Callback when a navigation item is selected. */
  onNavigate: (href: string) => void;

  /** Accessible label for the navigation landmark. */
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Responsive navigation that adapts layout based on viewport breakpoint.
 */
export const ResponsiveNav: React.FC<ResponsiveNavProps> = ({
  items,
  activePath,
  onNavigate,
  ariaLabel = 'Main navigation',
}) => {
  const { isTablet } = useBreakpoint();
  const [expanded, setExpanded] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleNavClick = useCallback(
    (href: string, e: React.MouseEvent) => {
      // Only call onNavigate for simple clicks (no modifier keys).
      // Link component handles native behavior for CTRL+Click, middle-click, etc.
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.button) {
        onNavigate(href);
      }
    },
    [onNavigate],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const focusable = navRef.current?.querySelectorAll<HTMLElement>('.responsive-nav__link');
    if (!focusable?.length) return;

    const items = Array.from(focusable);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    let nextIndex = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = items.length - 1;
    }

    if (nextIndex >= 0) {
      items[nextIndex].focus();
    }
  }, []);

  return (
    <nav
      ref={navRef}
      className="responsive-nav"
      aria-label={ariaLabel}
      data-expanded={isTablet ? expanded : undefined}
      onKeyDown={handleKeyDown}
    >
      {isTablet && (
        <button
          type="button"
          className="responsive-nav__toggle"
          onClick={handleToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        >
          <span aria-hidden="true">{expanded ? '◁' : '▷'}</span>
        </button>
      )}

      <ul className="responsive-nav__list" role="list">
        {items.map((item) => {
          const isActive =
            item.href === '/'
              ? activePath === '/'
              : activePath === item.href || activePath.startsWith(item.href + '/');
          return (
            <li key={item.id} className="responsive-nav__item" role="listitem">
              <Link
                to={item.href}
                className="responsive-nav__link"
                aria-current={isActive ? 'page' : undefined}
                onClick={(e) => handleNavClick(item.href, e)}
              >
                <span className="responsive-nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="responsive-nav__label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
