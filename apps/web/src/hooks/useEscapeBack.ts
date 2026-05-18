// SPDX-License-Identifier: BUSL-1.1

/**
 * useEscapeBack — Navigates back on Escape key press for detail/sub pages.
 *
 * Only fires when:
 * - The current route is a detail page (contains a path segment that looks like an ID)
 * - No modal or dialog is currently open in the DOM
 * - No editable element (input, textarea, contenteditable) is focused
 *
 * Does NOT fire on top-level pages (dashboard, accounts list, etc.)
 *
 * @module hooks/useEscapeBack
 * References: issue #1523
 */

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Route patterns that indicate a detail/sub page (has an ID segment). */
const DETAIL_ROUTE_PATTERN =
  /^\/(accounts|transactions|budgets|goals|investments|bills)\/[^/]+$|^\/import\/wizard$/;

/**
 * Returns true if the current pathname represents a detail page where
 * Escape should navigate back.
 */
function isDetailPage(pathname: string): boolean {
  return DETAIL_ROUTE_PATTERN.test(pathname);
}

/** Returns true if a modal or dialog is currently open in the DOM. */
function isDialogOpen(): boolean {
  const openDialogs = document.querySelectorAll(
    '[role="dialog"][aria-modal="true"], dialog[open], [data-state="open"]',
  );
  return openDialogs.length > 0;
}

/** Returns true if the focused element is an editable field. */
function isEditableFocused(): boolean {
  const target = document.activeElement;
  if (!target || target === document.body) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

/**
 * Hook that listens for the Escape key and navigates back on detail pages.
 *
 * Usage: Call this hook in AppLayout or individual detail page components.
 */
export function useEscapeBack(): void {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDetailPage(pathname)) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      if (isDialogOpen()) return;
      if (isEditableFocused()) return;

      event.preventDefault();
      navigate(-1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, navigate]);
}
