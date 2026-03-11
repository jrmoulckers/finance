// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { AppRoutes } from './routes';

/**
 * Root application component.
 *
 * Provides the top-level layout shell with a skip-to-content link
 * for keyboard / screen-reader users, a navigation landmark, and
 * the main content area where routes render.
 */
export const App: FC = () => {
  return (
    <>
      {/* Skip link - first focusable element for keyboard users */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
        onFocus={(e) => {
          const el = e.currentTarget;
          el.style.position = 'static';
          el.style.width = 'auto';
          el.style.height = 'auto';
          el.style.overflow = 'visible';
        }}
        onBlur={(e) => {
          const el = e.currentTarget;
          el.style.position = 'absolute';
          el.style.left = '-9999px';
          el.style.width = '1px';
          el.style.height = '1px';
          el.style.overflow = 'hidden';
        }}
      >
        Skip to main content
      </a>

      <nav aria-label="Main navigation">
        {/* Navigation links will be implemented by UI components */}
      </nav>

      <main id="main-content">
        <AppRoutes />
      </main>
    </>
  );
};
