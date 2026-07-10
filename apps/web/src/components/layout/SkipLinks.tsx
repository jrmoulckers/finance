// SPDX-License-Identifier: BUSL-1.1

import { type FC } from 'react';

import { SkipToContent } from './SkipToContent';

/**
 * Selector matching the primary navigation landmark across layouts. The desktop
 * sidebar `<nav aria-label="Primary" id="primary-navigation">` carries the id;
 * the mobile bottom bar is matched by class since only one is visible at a time.
 */
const PRIMARY_NAV_SELECTOR = '#primary-navigation, nav.bottom-nav';

/**
 * Resolve the primary navigation landmark that is currently visible. On desktop
 * this is the sidebar; on mobile the sidebar is hidden and the bottom nav is
 * used instead. Falls back to the first match when visibility can't be
 * determined (e.g. jsdom, where `offsetParent` is always null).
 */
function resolvePrimaryNav(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(PRIMARY_NAV_SELECTOR));
  return candidates.find((el) => el.offsetParent !== null) ?? candidates[0] ?? null;
}

/**
 * Bypass-block skip links rendered at the very top of the shell (SC 2.4.1).
 *
 * Renders a paired "Skip to content" + "Skip to navigation" so keyboard and
 * screen-reader users can jump either past the navigation (to `#main-content`)
 * or straight to the primary navigation landmark. The `.skip-links` container
 * reveals both links together on the first Tab.
 */
export const SkipLinks: FC = () => (
  <div className="skip-links">
    <SkipToContent targetId="main-content" label="Skip to main content" />
    <SkipToContent
      targetId="primary-navigation"
      label="Skip to navigation"
      resolveTarget={resolvePrimaryNav}
    />
  </div>
);

export default SkipLinks;
