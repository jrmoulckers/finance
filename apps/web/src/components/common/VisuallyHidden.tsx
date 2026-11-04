// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

/**
 * Props for {@link VisuallyHidden}.
 *
 * Polymorphic: the rendered element is chosen via `as` (defaults to `span`).
 * All other props are forwarded to the underlying element, so callers can pass
 * `id`, `role`, `aria-live`, event handlers, etc.
 */
export type VisuallyHiddenProps<T extends React.ElementType = 'span'> = {
  /** The element type to render. @default 'span' */
  as?: T;
  /** Content that is hidden visually but exposed to assistive technology. */
  children?: React.ReactNode;
  /** Additional class names appended after the `sr-only` utility class. */
  className?: string;
  /** Reveal content on keyboard focus, for skip-link-style controls. @default false */
  focusable?: boolean;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className' | 'focusable'>;

/**
 * Renders content that is visually hidden but remains available to assistive
 * technology, using the well-established `.sr-only` clip technique.
 *
 * Prefer this typed primitive over hand-written `className="sr-only"` strings
 * or bespoke inline styles so screen-reader-only content stays consistent
 * (WCAG SC 1.3.1 Info and Relationships, SC 4.1.2 Name, Role, Value).
 *
 * @example
 * ```tsx
 * <VisuallyHidden>Loading transactions</VisuallyHidden>
 * <VisuallyHidden as="h2" id="dialog-title">Confirm deletion</VisuallyHidden>
 * <VisuallyHidden as="a" href="#main-content" focusable>Skip to content</VisuallyHidden>
 * ```
 */
export function VisuallyHidden<T extends React.ElementType = 'span'>({
  as,
  children,
  className,
  focusable = false,
  ...rest
}: VisuallyHiddenProps<T>): React.ReactElement {
  const Component = (as ?? 'span') as React.ElementType;
  const composedClassName = ['sr-only', focusable && 'sr-only-focusable', className]
    .filter(Boolean)
    .join(' ');
  return (
    <Component className={composedClassName} {...rest}>
      {children}
    </Component>
  );
}

export default VisuallyHidden;
