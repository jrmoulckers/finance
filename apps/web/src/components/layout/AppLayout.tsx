// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';

import FeedbackDialog from '../FeedbackDialog';
import { SyncStatusBar } from '../common';
import { ConflictResolutionDialog } from '../common/ConflictResolutionDialog';
import { useKeyboardShortcuts } from '../../hooks';
import { useAccessibility } from '../../hooks/useAccessibility';
import { usePrivacyMode } from '../../contexts/PrivacyModeContext';
import { useEscapeBack } from '../../hooks/useEscapeBack';
import { useSyncStatus } from '../../hooks/useSyncStatus';

import { BottomNavigation, SidebarNavigation } from './Navigation';
import { getVisibleNavItems } from './navConfig';
import { InstallBanner } from '../common/InstallBanner';
import { LegalLinks } from '../legal/LegalLinks';
import { Breadcrumbs, NavShortcuts } from '../navigation';

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
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  const { isSimplified } = useAccessibility();
  const shortcutItems = useMemo(() => getVisibleNavItems(isSimplified), [isSimplified]);
  const { showHelp, setShowHelp } = useKeyboardShortcuts({
    onNavigate,
    onTogglePrivacyMode: togglePrivacyMode,
  });
  const { conflictCount } = useSyncStatus();
  const [showConflicts, setShowConflicts] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Navigate back on Escape key for detail pages (#1523)
  useEscapeBack();

  const openKeyboardShortcuts = useCallback(() => {
    setShowHelp(true);
  }, [setShowHelp]);

  const closeKeyboardShortcuts = useCallback(() => {
    setShowHelp(false);
  }, [setShowHelp]);

  const goToSettings = useCallback(() => {
    onNavigate('/settings');
  }, [onNavigate]);

  const openConflictDialog = useCallback(() => {
    setShowConflicts(true);
  }, []);

  const closeConflictDialog = useCallback(() => {
    setShowConflicts(false);
  }, []);

  const openFeedbackDialog = useCallback(() => {
    setShowFeedback(true);
  }, []);

  const closeFeedbackDialog = useCallback(() => {
    setShowFeedback(false);
  }, []);

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SidebarNavigation
        activePath={activePath}
        onNavigate={onNavigate}
        onOpenShortcuts={openKeyboardShortcuts}
        onOpenFeedback={openFeedbackDialog}
      />
      <div className={`app-shell${isSimplified ? ' app-shell--simplified' : ''}`}>
        <SyncStatusBar />
        <header className="app-header" aria-label="App header">
          <div>
            <h1 className="app-header__title">{pageTitle}</h1>
            <Breadcrumbs currentPath={activePath} currentTitle={pageTitle} />
          </div>
          <div className="app-header__actions">
            {conflictCount > 0 && (
              <button
                type="button"
                className={`icon-button icon-button--warning${isSimplified ? ' icon-button--labeled' : ''}`}
                aria-label={`${conflictCount} sync conflict${conflictCount !== 1 ? 's' : ''} need attention`}
                onClick={openConflictDialog}
              >
                <span className="icon-button__badge" aria-hidden="true">
                  {conflictCount}
                </span>
                <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20">
                  <path
                    d="M12 8v4m0 4h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                {isSimplified ? <span className="icon-button__label">Review alerts</span> : null}
              </button>
            )}
            <button
              type="button"
              className={`icon-button${isPrivacyMode ? ' icon-button--active' : ''}${isSimplified ? ' icon-button--labeled' : ''}`}
              aria-label={isPrivacyMode ? 'Turn privacy mode off' : 'Turn privacy mode on'}
              aria-pressed={isPrivacyMode}
              title="Privacy mode"
              onClick={togglePrivacyMode}
            >
              <span className="icon-button__glyph" aria-hidden="true">
                {isPrivacyMode ? '●' : '○'}
              </span>
              {isSimplified ? (
                <span className="icon-button__label">
                  {isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
                </span>
              ) : null}
            </button>
            {!isSimplified ? (
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
            ) : null}
            <button
              type="button"
              className={`icon-button${isSimplified ? ' icon-button--labeled' : ''}`}
              aria-label="Settings"
              onClick={goToSettings}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              </svg>
              {isSimplified ? <span className="icon-button__label">Settings</span> : null}
            </button>
          </div>
        </header>
        <main id="main-content" className="app-main" aria-label={pageTitle}>
          {children}
        </main>
        <footer className="app-footer">
          <LegalLinks />
        </footer>
        <BottomNavigation
          activePath={activePath}
          onNavigate={onNavigate}
          onOpenFeedback={openFeedbackDialog}
        />
      </div>
      <InstallBanner />
      <NavShortcuts
        isOpen={showHelp}
        onClose={closeKeyboardShortcuts}
        onNavigate={onNavigate}
        items={shortcutItems}
      />
      <ConflictResolutionDialog isOpen={showConflicts} onClose={closeConflictDialog} />
      <FeedbackDialog isOpen={showFeedback} onClose={closeFeedbackDialog} />
    </div>
  );
};

export default AppLayout;
