// SPDX-License-Identifier: BUSL-1.1

/**
 * ScrollToTop — app-wide scroll restoration manager.
 *
 * Restores the previous scroll position on browser back/forward navigation
 * (history `POP`) and scrolls to the top on fresh forward navigation
 * (`PUSH` / `REPLACE`), so returning to a long page (dashboard, transactions)
 * lands the visitor exactly where they left off.
 *
 * Robustness — this layout scrolls the window/document (the sidebar is
 * `position: sticky` and `.app-main` has no `overflow`), so `window.scrollTo`
 * is correct. The naive "restore once on the next frame" approach is not:
 *
 *  - **`history.scrollRestoration = 'manual'`** opts out of the browser's
 *    native restoration so it cannot race (and lose to) the manual restore.
 *  - **Continuous, per-`location.key` capture** persists the live scroll offset
 *    while the visitor scrolls (rAF-throttled `scroll` listener plus a
 *    `pagehide`/`beforeunload` flush). Reading the offset only at navigation
 *    time is unreliable: navigating from a tall page to a shorter one lets the
 *    browser clamp `window.scrollY` before it can be saved.
 *  - **Async-aware POP restore** re-applies the saved offset across animation
 *    frames until the document is tall enough to honour it. Deep pages hydrate
 *    asynchronously from SQLite-WASM, so a single `scrollTo` on the first frame
 *    lands before the content exists and is silently clamped to 0.
 *
 * Place inside `<BrowserRouter>` to activate. Mounted once at the app root.
 *
 * @module components/navigation/ScrollToTop
 * References: issues #1451, #3151
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';

import { getScrollPosition, recordScrollPosition } from '../../lib/navigation/history';

/**
 * Maximum number of animation frames to keep re-applying a restored scroll
 * offset while async page content hydrates (~0.8s at 60fps). Bounded so a page
 * that never grows tall enough (e.g. the saved offset is no longer reachable)
 * cannot spin forever.
 */
const RESTORE_MAX_FRAMES = 50;

const isBrowser = typeof window !== 'undefined';

/** Largest vertical offset the document can currently be scrolled to. */
function getMaxScrollY(): number {
  if (!isBrowser) {
    return 0;
  }
  const doc = document.documentElement;
  return Math.max(0, doc.scrollHeight - window.innerHeight);
}

/**
 * Scrolls to the top of the page on forward navigation.
 * Restores the last local scroll position on POP navigation.
 */
export const ScrollToTop: React.FC = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  // The history key of the page currently on screen. Updated synchronously in a
  // layout effect so scroll captures are always attributed to the right page.
  const currentKeyRef = useRef(location.key);

  // Opt out of the browser's native scroll restoration so it does not race the
  // manual, async-aware restoration below. Restore the prior value on unmount.
  useEffect(() => {
    if (!isBrowser || !('scrollRestoration' in window.history)) {
      return;
    }
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  // Continuously persist the live scroll offset for the page on screen so the
  // outgoing offset is captured before any navigation can clamp it.
  useEffect(() => {
    if (!isBrowser) {
      return;
    }
    let frame = 0;
    const persist = () => {
      frame = 0;
      recordScrollPosition(currentKeyRef.current, window.scrollX, window.scrollY);
    };
    const handleScroll = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(persist);
    };
    const flush = () => {
      recordScrollPosition(currentKeyRef.current, window.scrollX, window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  // On every route change, point the capture key at the new page and either
  // restore its saved offset (POP) or reset to the top (PUSH/REPLACE). A layout
  // effect runs before paint, so the restore happens without a flash of the top
  // of the page.
  useLayoutEffect(() => {
    if (!isBrowser) {
      return;
    }
    currentKeyRef.current = location.key;

    let frameId = 0;
    const cancel = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
    };

    if (navigationType === 'POP') {
      const saved = getScrollPosition(location.key);
      if (saved && (saved.x !== 0 || saved.y !== 0)) {
        let attempts = 0;
        const restore = () => {
          window.scrollTo(saved.x, saved.y);
          attempts += 1;
          const reachedTarget = Math.abs(window.scrollY - saved.y) <= 2;
          const documentTallEnough = getMaxScrollY() >= saved.y - 2;
          if (attempts >= RESTORE_MAX_FRAMES || (reachedTarget && documentTallEnough)) {
            frameId = 0;
            return;
          }
          frameId = window.requestAnimationFrame(restore);
        };
        frameId = window.requestAnimationFrame(restore);
        return cancel;
      }
    }

    // Fresh navigation (or a POP with no saved offset): start at the top.
    window.scrollTo(0, 0);
    return cancel;
  }, [location.key, navigationType]);

  return null;
};
