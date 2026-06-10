// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAccessibility } from '../hooks/useAccessibility';
import './settings/settings-shell.css';

/**
 * Section descriptors used to render the left-rail navigation.
 *
 * Each entry maps a relative URL (matched as `/settings/<to>`) to the
 * human-readable label and accessible description shown to the user.
 */
const SETTINGS_SECTIONS: ReadonlyArray<{ to: string; label: string; description: string }> = [
  { to: 'account', label: 'Account', description: 'Profile, sign out, delete account' },
  {
    to: 'preferences',
    label: 'Preferences',
    description: 'Currency, theme, notifications, display',
  },
  {
    to: 'privacy',
    label: 'Privacy & Data',
    description: 'Privacy mode, consent, export, deletion',
  },
  { to: 'sync', label: 'Sync & Devices', description: 'Sync status, passkeys, biometric lock' },
  { to: 'advanced', label: 'Advanced', description: 'Experimental features' },
  { to: 'about', label: 'About', description: 'Version, build, license, credits' },
];

/**
 * Settings shell — renders a persistent left-rail navigation and the
 * matched sub-page in the right-hand content area via {@link Outlet}.
 *
 * The shell is intentionally thin: all setting controls live in the
 * dedicated sub-pages under `apps/web/src/pages/settings/*`. This file
 * only handles layout, in-section navigation, and the page heading.
 */
const SIMPLIFIED_SETTINGS_SECTIONS = new Set(['account', 'preferences', 'privacy', 'about']);

export const SettingsPage: React.FC = () => {
  const { isSimplified } = useAccessibility();
  const location = useLocation();
  const sections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter(
        (section) =>
          !isSimplified ||
          SIMPLIFIED_SETTINGS_SECTIONS.has(section.to) ||
          location.pathname.endsWith(`/${section.to}`),
      ),
    [isSimplified, location.pathname],
  );

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-6)',
        }}
      >
        Settings
      </h2>
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={false}
              className={({ isActive }) =>
                `settings-nav__link${isActive ? ' settings-nav__link--active' : ''}`
              }
              aria-label={`${section.label} — ${section.description}`}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>
        <div className="settings-shell__content">
          <Outlet />
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
