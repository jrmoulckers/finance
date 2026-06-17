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

import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import { getScrollPosition, recordScrollPosition } from '../../lib/navigation/history';

/**
 * Scrolls to the top of the page on forward navigation.
 * Restores the last local scroll position on POP navigation.
 */
export const ScrollToTop: React.FC = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousKeyRef = useRef(location.key);

  useEffect(() => {
    recordScrollPosition(previousKeyRef.current, window.scrollX, window.scrollY);

    const frame = window.requestAnimationFrame(() => {
      if (navigationType === 'POP') {
        const savedPosition = getScrollPosition(location.key);
        if (savedPosition) {
          window.scrollTo(savedPosition.x, savedPosition.y);
          previousKeyRef.current = location.key;
          return;
        }
      }

      window.scrollTo(0, 0);
      previousKeyRef.current = location.key;
    });

    const handleBeforeUnload = () => {
      recordScrollPosition(location.key, window.scrollX, window.scrollY);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      recordScrollPosition(location.key, window.scrollX, window.scrollY);
    };
  }, [location.key, navigationType]);

  return null;
};
