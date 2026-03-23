// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback } from 'react';

import { KeyboardShortcutsModal, UpdateBanner } from '../common';
import { OfflineBanner } from '../OfflineBanner';
import { useKeyboardShortcuts } from '../../hooks';

import { BottomNavigation, SidebarNavigation } from './Navigation';
import { InstallBanner } from '../common/InstallBanner';

export interface AppLayoutProps {
  activePath: string;
  onNavigate: (path: string) => void;
  pageTitle: string;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activePath,
  onNavigate,
  pageTitle,
  children,
}) => {
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  const openKeyboardShortcuts = useCallback(() => {
    setShowHelp(true);
  }, [setShowHelp]);

  const closeKeyboardShortcuts = useCallback(() => {
    setShowHelp(false);
  }, [setShowHelp]);

  const goToSettings = useCallback(() => {
    onNavigate('/settings');
  }, [onNavigate]);

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SidebarNavigation
        activePath={activePath}
        onNavigate={onNavigate}
        onOpenShortcuts={openKeyboardShortcuts}
      />
      <div className="app-shell">
        <UpdateBanner />
        <OfflineBanner />
        <header className="app-header" aria-label="App header">
          <h1 className="app-header__title">{pageTitle}</h1>
          <div className="app-header__actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Keyboard shortcuts"
              aria-keyshortcuts="Shift+/"
              onClick={openKeyboardShortcuts}
            >
              <span className="icon-button__glyph" aria-hidden="true">
                ?
              </span>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Settings"
              onClick={goToSettings}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              </svg>
            </button>
          </div>
        </header>
        <main id="main-content" className="app-main" aria-label={pageTitle}>
          {children}
        </main>
        <BottomNavigation activePath={activePath} onNavigate={onNavigate} />
      </div>
      <InstallBanner />
      <KeyboardShortcutsModal isOpen={showHelp} onClose={closeKeyboardShortcuts} />
    </div>
  );
};

export default AppLayout;
