// SPDX-License-Identifier: BUSL-1.1

/**
 * VisuallyHidden — reusable primitive for screen-reader-only content.
 *
 * Renders content that is removed from the visual layout but remains in the
 * accessibility tree, so assistive technology can read it. Use it for
 * off-screen labels, live-region text, and supplementary context that would be
 * redundant or cluttering if shown visually.
 *
 * Prefer this typed component over sprinkling `className="sr-only"` strings so
 * the hiding technique stays consistent across the app (WCAG 1.3.1 Info and
 * Relationships, 4.1.2 Name, Role, Value).
 *
 * The visual hiding is provided by the global `.sr-only` utility defined in
 * `styles/accessibility.css`.
 *
 * @example
 * ```tsx
 * <button>
 *   <TrashIcon aria-hidden="true" />
 *   <VisuallyHidden>Delete transaction</VisuallyHidden>
 * </button>
 *
 * // Announce dynamic status to screen readers:
 * <VisuallyHidden as="div" aria-live="polite">{statusMessage}</VisuallyHidden>
 *
 * // "Skip link" style content that appears when focused:
 * <VisuallyHidden as="a" href="#main" focusable>Skip to content</VisuallyHidden>
 * ```
 *
 * @module components/common/VisuallyHidden
 * References: issue #3601
 */

import React from 'react';

/** Props shared by every VisuallyHidden rendering, independent of element type. */
interface VisuallyHiddenOwnProps {
  /**
   * When true, the content becomes visible while it (or a descendant) has
   * focus. Use for interactive off-screen content such as skip links.
   * @default false
   */
  focusable?: boolean;
  /** Content to hide visually but expose to assistive technology. */
  children?: React.ReactNode;
}

/**
 * Polymorphic element type. Defaults to `'span'` but can render any element
 * (e.g. `'div'` for a live region, `'a'` for a focusable skip link) via `as`.
 */
type VisuallyHiddenProps<E extends React.ElementType> = VisuallyHiddenOwnProps & {
  /** Element or component to render as. Defaults to `'span'`. */
  as?: E;
} & Omit<React.ComponentPropsWithoutRef<E>, keyof VisuallyHiddenOwnProps | 'as'>;

/** Compose the class name for visually-hidden content. */
function visuallyHiddenClassName(focusable: boolean, className?: string): string {
  return ['sr-only', focusable ? 'sr-only-focusable' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
}

/**
 * Reusable screen-reader-only wrapper. Renders a `<span>` by default, or any
 * element supplied via the `as` prop.
 */
export function VisuallyHidden<E extends React.ElementType = 'span'>({
  as,
  focusable = false,
  className,
  children,
  ...rest
}: VisuallyHiddenProps<E>): React.ReactElement {
  const Component = (as ?? 'span') as React.ElementType;
  return (
    <Component className={visuallyHiddenClassName(focusable, className)} {...rest}>
      {children}
    </Component>
  );
}

export type { VisuallyHiddenProps };
export default VisuallyHidden;
