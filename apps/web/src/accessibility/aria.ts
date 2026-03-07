/**
 * ARIA accessibility utilities for the Finance PWA.
 *
 * Provides semantic labeling helpers, keyboard navigation hooks,
 * and focus management primitives. Use native HTML semantics first;
 * apply these utilities only when native semantics are insufficient.
 *
 * @module accessibility/aria
 * @see https://www.w3.org/WAI/ARIA/apg/
 */

import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Semantic labeling                                                 */
/* ------------------------------------------------------------------ */

/**
 * Apply an accessible label to an HTML or SVG element.
 *
 * Prefers aria-labelledby when a visible label element exists;
 * falls back to aria-label for cases where no visible text is
 * available (e.g. icon-only buttons, SVG charts).
 */
export function ariaLabel(
  element: HTMLElement | SVGElement,
  label: string,
  options: { useIdReference?: boolean } = {},
): void {
  if (options.useIdReference) {
    element.setAttribute('aria-labelledby', label);
    element.removeAttribute('aria-label');
  } else {
    element.setAttribute('aria-label', label);
    element.removeAttribute('aria-labelledby');
  }
}

/** Set aria-describedby on an element, pointing at a description node. */
export function ariaDescribe(
  element: HTMLElement | SVGElement,
  descriptionId: string,
): void {
  element.setAttribute('aria-describedby', descriptionId);
}

/**
 * Mark an element as live region so assistive technology announces
 * dynamic content changes (e.g. balance updates, chart re-renders).
 */
export function ariaLive(
  element: HTMLElement,
  politeness: 'polite' | 'assertive' = 'polite',
): void {
  element.setAttribute('aria-live', politeness);
  element.setAttribute('role', 'status');
}

/* ------------------------------------------------------------------ */
/*  Keyboard navigation hooks                                         */
/* ------------------------------------------------------------------ */

export interface ArrowKeyNavigationOptions {
  orientation?: 'horizontal' | 'vertical' | 'both';
  loop?: boolean;
  onFocus?: (index: number) => void;
}

/**
 * Hook that enables arrow-key navigation within a container of
 * focusable items. Follows the WAI-ARIA roving tabindex pattern.
 */
export function useArrowKeyNavigation(
  containerRef: RefObject<HTMLElement | null>,
  options: ArrowKeyNavigationOptions = {},
): {
  activeIndex: number;
  handleKeyDown: (e: ReactKeyboardEvent) => void;
} {
  const { orientation = 'both', loop = true, onFocus } = options;
  const activeIndexRef = useRef(0);

  const getFocusableItems = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(
        '[data-chart-point], [role="option"], [role="menuitem"], [role="tab"], button, a[href]',
      ),
    );
  }, [containerRef]);

  const setActiveIndex = useCallback(
    (index: number) => {
      const items = getFocusableItems();
      if (items.length === 0) return;
      let next = index;
      if (loop) {
        next = ((index % items.length) + items.length) % items.length;
      } else {
        next = Math.max(0, Math.min(index, items.length - 1));
      }
      items.forEach((item, i) => {
        item.setAttribute('tabindex', i === next ? '0' : '-1');
      });
      items[next].focus();
      activeIndexRef.current = next;
      onFocus?.(next);
    },
    [getFocusableItems, loop, onFocus],
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      const prev = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const next = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
      const bothPrev = ['ArrowLeft', 'ArrowUp'];
      const bothNext = ['ArrowRight', 'ArrowDown'];

      const isPrev = orientation === 'both' ? bothPrev.includes(e.key) : e.key === prev;
      const isNext = orientation === 'both' ? bothNext.includes(e.key) : e.key === next;
      const isHome = e.key === 'Home';
      const isEnd = e.key === 'End';

      if (!isPrev && !isNext && !isHome && !isEnd) return;
      e.preventDefault();

      if (isHome) setActiveIndex(0);
      else if (isEnd) setActiveIndex(getFocusableItems().length - 1);
      else if (isPrev) setActiveIndex(activeIndexRef.current - 1);
      else setActiveIndex(activeIndexRef.current + 1);
    },
    [orientation, setActiveIndex, getFocusableItems],
  );

  useEffect(() => {
    const items = getFocusableItems();
    items.forEach((item, i) => {
      item.setAttribute('tabindex', i === 0 ? '0' : '-1');
    });
  }, [getFocusableItems]);

  return { activeIndex: activeIndexRef.current, handleKeyDown };
}

/* ------------------------------------------------------------------ */
/*  Focus trap                                                        */
/* ------------------------------------------------------------------ */

export interface FocusTrapOptions {
  active?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Hook that traps focus within a container (e.g. a modal dialog).
 * Tab / Shift+Tab cycle through focusable descendants without
 * leaving the container. Focus is restored when the trap deactivates.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {},
): void {
  const { active = true, restoreFocus = true, initialFocusRef } = options;
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement;
    const container = containerRef.current;

    const initialTarget =
      initialFocusRef?.current ??
      container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    initialTarget?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus) previouslyFocusedRef.current?.focus();
    };
  }, [active, containerRef, initialFocusRef, restoreFocus]);
}

/* ------------------------------------------------------------------ */
/*  Focus management utilities                                        */
/* ------------------------------------------------------------------ */

/** Programmatically move focus to an element, making it temporarily focusable if needed. */
export function moveFocusTo(element: HTMLElement | null): void {
  if (!element) return;
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  }
  element.focus();
}

/** Query the first focusable descendant of a container. */
export function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

/** Announce a message to screen readers via a visually-hidden live region. */
let liveRegion: HTMLElement | null = null;

export function announce(
  message: string,
  politeness: 'polite' | 'assertive' = 'polite',
): void {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', politeness);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('role', 'status');
    Object.assign(liveRegion.style, {
      position: 'absolute', width: '1px', height: '1px', padding: '0',
      margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap', border: '0',
    });
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', politeness);
  liveRegion.textContent = '';
  requestAnimationFrame(() => { if (liveRegion) liveRegion.textContent = message; });
}
