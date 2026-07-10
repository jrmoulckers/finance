// SPDX-License-Identifier: BUSL-1.1

import type { CSSProperties, ElementType, ReactElement, ReactNode } from 'react';

import {
  DEFAULT_ENTER_DURATION_MS,
  DEFAULT_EXIT_DURATION_MS,
  useMountTransition,
} from '../../hooks/useMountTransition';

import './MountTransition.css';

/** Props for {@link MountTransition}. */
export interface MountTransitionProps {
  /** Whether the children should be shown. */
  isVisible: boolean;
  /** Content to mount/animate. */
  children: ReactNode;
  /**
   * Base CSS class. Stage modifier classes are appended, e.g.
   * `mount-transition mount-transition--entering`. Override with your own base
   * class to supply bespoke enter/exit styles.
   */
  className?: string;
  /** Enter duration in ms (token-aligned default). */
  enterDuration?: number;
  /** Exit duration in ms (token-aligned default). */
  exitDuration?: number;
  /** Wrapper element tag. Defaults to `div`. */
  as?: ElementType;
  /** Force reduced-motion behavior (defaults to the live user preference). */
  reducedMotion?: boolean;
}

/**
 * Reduced-motion-safe mount/exit transition wrapper.
 *
 * Thin component built on {@link useMountTransition}: it keeps `children`
 * mounted until the exit animation completes and applies stage-based classes
 * (`--entering`, `--entered`, `--exiting`) plus token-driven duration custom
 * properties. Under reduced motion it shows/hides instantly.
 */
export function MountTransition({
  isVisible,
  children,
  className = 'mount-transition',
  enterDuration = DEFAULT_ENTER_DURATION_MS,
  exitDuration = DEFAULT_EXIT_DURATION_MS,
  as: Wrapper = 'div',
  reducedMotion,
}: MountTransitionProps): ReactElement | null {
  const { shouldRender, stage } = useMountTransition({
    isVisible,
    enterDuration,
    exitDuration,
    reducedMotion,
  });

  if (!shouldRender) {
    return null;
  }

  const style = {
    '--mount-enter-duration': `${enterDuration}ms`,
    '--mount-exit-duration': `${exitDuration}ms`,
  } as CSSProperties;

  return (
    <Wrapper className={`${className} ${className}--${stage}`} style={style}>
      {children}
    </Wrapper>
  );
}

export default MountTransition;
