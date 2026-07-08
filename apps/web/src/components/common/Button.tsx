// SPDX-License-Identifier: BUSL-1.1

/**
 * Centralized, design-system-consistent button component for the web app.
 *
 * All buttons across `apps/web` should render through this component (or its
 * polymorphic `as` form) so that variants, sizes, states, and accessibility
 * behaviour stay consistent. It emits the shared `.form-button` class family
 * defined in `forms.css`, which is the canonical button design language.
 *
 * References: issue #3550
 */

import React from 'react';

import './Button.css';
import '../forms/forms.css';

/** Visual style of a button. */
export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'destructive';

/** Size of a button. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Props shared by every button rendering, independent of the element type. */
interface ButtonOwnProps {
  /** Visual style. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Size. Defaults to `md`. */
  size?: ButtonSize;
  /** Stretch to fill the width of the container. */
  fullWidth?: boolean;
  /**
   * When true, shows a spinner, sets `aria-busy`, and disables interaction.
   * Only meaningful for `<button>` renderings.
   */
  loading?: boolean;
  /** Optional leading icon element (hidden from assistive tech). */
  leadingIcon?: React.ReactNode;
  /** Optional trailing icon element (hidden from assistive tech). */
  trailingIcon?: React.ReactNode;
  /** Button label / contents. */
  children?: React.ReactNode;
}

/**
 * Polymorphic element type. Defaults to `'button'` but can render any element
 * or component (e.g. a react-router `Link`) via the `as` prop.
 */
type PolymorphicProps<E extends React.ElementType> = ButtonOwnProps & {
  /** Element or component to render as. Defaults to `'button'`. */
  as?: E;
} & Omit<React.ComponentPropsWithoutRef<E>, keyof ButtonOwnProps | 'as'>;

/** Props for {@link Button} when rendered as a native `<button>`. */
export type ButtonProps = PolymorphicProps<React.ElementType>;

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'form-button--primary',
  secondary: 'form-button--secondary',
  tertiary: 'form-button--tertiary',
  ghost: 'form-button--ghost',
  destructive: 'form-button--destructive',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'form-button--sm',
  md: '',
  lg: 'form-button--lg',
};

/**
 * Compose the class name for a button from its props.
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  className?: string;
}): string {
  return [
    'form-button',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? 'form-button--full' : '',
    loading ? 'form-button--loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * The centralized button. Renders a native `<button>` by default, or any other
 * element/component supplied via the `as` prop (for link-styled buttons, pass
 * `as={Link}` from react-router and a `to` prop).
 */
export const Button = React.forwardRef(function Button<E extends React.ElementType = 'button'>(
  {
    as,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    leadingIcon,
    trailingIcon,
    children,
    className,
    ...rest
  }: PolymorphicProps<E>,
  ref: React.Ref<Element>,
) {
  const Component = (as ?? 'button') as React.ElementType;
  const isNativeButton = Component === 'button';

  const composedClassName = buttonClassName({ variant, size, fullWidth, loading, className });

  // Native buttons need an explicit type and support disabled/aria-busy.
  const nativeButtonProps = isNativeButton
    ? {
        type: (rest as { type?: 'button' | 'submit' | 'reset' }).type ?? 'button',
        disabled: (rest as { disabled?: boolean }).disabled === true || loading || undefined,
        'aria-busy': loading || undefined,
      }
    : {};

  return (
    <Component ref={ref} className={composedClassName} {...rest} {...nativeButtonProps}>
      {loading && <span className="form-button__spinner" aria-hidden="true" />}
      {!loading && leadingIcon && (
        <span className="form-button__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      {children != null && <span className="form-button__label">{children}</span>}
      {trailingIcon && (
        <span className="form-button__icon" aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </Component>
  );
}) as <E extends React.ElementType = 'button'>(
  props: PolymorphicProps<E> & { ref?: React.Ref<Element> },
) => React.ReactElement | null;

export default Button;
