// SPDX-License-Identifier: BUSL-1.1

/**
 * ScrollToTop — Resets scroll position on forward navigation (PUSH/REPLACE).
 *
 * Preserves scroll position on browser back/forward (POP) to maintain
 * native browser behavior.
 *
 * Place this component inside <BrowserRouter> to activate.
 *
 * @module components/navigation/ScrollToTop
 * References: issue #1451
 */

import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Scrolls to the top of the page on forward navigation.
 * Does nothing on POP (back/forward) to preserve browser scroll restoration.
 */
export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    // Only reset scroll on PUSH or REPLACE navigation (clicking links, programmatic navigation).
    // On POP (browser back/forward), let the browser handle scroll restoration.
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
};
