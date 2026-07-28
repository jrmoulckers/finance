// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useAccessibility } from '../hooks/useAccessibility';
import './settings/settings-shell.css';

/**
 * Section descriptors used to render the left-rail navigation.
 *
 * Each entry maps a relative URL (matched as `/settings/<to>`) to the
 * human-readable label and accessible description shown to the user.
 */
const SETTINGS_SECTIONS: ReadonlyArray<{
  to: string;
  label: string;
  description: string;
  keywords: string;
}> = [
  {
    to: 'account',
    label: 'Account',
    description: 'Profile, sign out, delete account',
    keywords: 'profile email sign out logout delete account identity',
  },
  {
    to: 'preferences',
    label: 'Preferences',
    description: 'Currency, theme, notifications, display',
    keywords:
      'currency language locale time zone theme dark light notifications quiet hours haptics accessibility font size density colors display categorization',
  },
  {
    to: 'privacy',
    label: 'Privacy & Data',
    description: 'Privacy mode, consent, export, deletion',
    keywords:
      'privacy mode consent gdpr export data deletion app lock idle timeout error reporting monitoring',
  },
  {
    to: 'security',
    label: 'Security',
    description: 'Encryption, transport protection, audit log',
    keywords: 'encryption transport tls key derivation audit log residency unlock passphrase',
  },
  {
    to: 'sync',
    label: 'Sync & Devices',
    description: 'Sync status, passkeys, biometric lock',
    keywords: 'sync status offline passkey webauthn biometric device sign-in method',
  },
  {
    to: 'advanced',
    label: 'Advanced',
    description: 'Experimental features',
    keywords: 'experimental mood tags feature flags danger zone erase',
  },
  {
    to: 'about',
    label: 'About',
    description: 'Version, build, license, credits',
    keywords: 'version build sha license legal credits diagnostics acknowledgements',
  },
];

/**
 * Settings shell — renders a persistent left-rail navigation and the
 * matched sub-page in the right-hand content area via {@link Outlet}.
 *
 * The shell is intentionally thin: all setting controls live in the
 * dedicated sub-pages under `apps/web/src/pages/settings/*`. This file
 * only handles layout, in-section navigation, and the page heading.
 */
const SIMPLIFIED_SETTINGS_SECTIONS = new Set([
  'account',
  'preferences',
  'privacy',
  'security',
  'about',
]);

export const SettingsPage: React.FC = () => {
  const { isSimplified } = useAccessibility();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const sections = useMemo(() => {
    const visibleInMode = SETTINGS_SECTIONS.filter(
      (section) =>
        !isSimplified ||
        SIMPLIFIED_SETTINGS_SECTIONS.has(section.to) ||
        location.pathname.endsWith(`/${section.to}`),
    );

    if (!normalizedQuery) {
      return visibleInMode;
    }

    return visibleInMode.filter(
      (section) =>
        section.label.toLowerCase().includes(normalizedQuery) ||
        section.description.toLowerCase().includes(normalizedQuery) ||
        section.keywords.includes(normalizedQuery),
    );
  }, [isSimplified, location.pathname, normalizedQuery]);

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
        <div className="settings-shell__sidebar">
          <div className="settings-nav-search">
            <label className="sr-only" htmlFor="settings-search">
              Search settings
            </label>
            <input
              id="settings-search"
              type="search"
              className="form-input settings-nav-search__input"
              placeholder="Search settings…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-describedby="settings-search-results"
              autoComplete="off"
            />
          </div>
          <nav className="settings-nav" aria-label="Settings sections">
            {sections.length === 0 ? (
              <p className="settings-nav__empty">No settings match your search.</p>
            ) : (
              sections.map((section) => (
                <NavLink
                  key={section.to}
                  to={section.to}
                  end={false}
                  className={({ isActive }) =>
                    `settings-nav__link${isActive ? ' settings-nav__link--active' : ''}`
                  }
                >
                  <span className="settings-nav__link-label">{section.label}</span>
                  <span className="settings-nav__link-description">{section.description}</span>
                </NavLink>
              ))
            )}
          </nav>
          <p id="settings-search-results" className="sr-only" role="status" aria-live="polite">
            {normalizedQuery
              ? `${sections.length} ${sections.length === 1 ? 'section' : 'sections'} match your search.`
              : ''}
          </p>
        </div>
        <div className="settings-shell__content">
          <Outlet />
        </div>
      </div>
    </>
  );
};

export default SettingsPage;
