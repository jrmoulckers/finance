// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useState } from 'react';

import {
  KeyboardShortcutsModal,
  QuickEntryFab,
  QuickEntryForm,
  UpdateBanner,
  WatchlistAlertBanner,
} from '../common';
import { OfflineBanner } from '../OfflineBanner';
import { useKeyboardShortcuts, useSpendingWatchlist, useTransactions } from '../../hooks';
import type { CreateTransactionInput } from '../../db/repositories/transactions';

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
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const { createTransaction } = useTransactions();
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  const { alerts } = useSpendingWatchlist();

  // Global "N" keyboard shortcut to open quick entry
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore when modifier keys are held or focus is in an input/textarea
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const tag = (event.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((event.target as HTMLElement).isContentEditable) return;

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        setQuickEntryOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleQuickEntrySubmit = useCallback(
    (data: CreateTransactionInput) => {
      createTransaction(data);
    },
    [createTransaction],
  );

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
        {!alertsDismissed && alerts.length > 0 && (
          <WatchlistAlertBanner alerts={alerts} onDismiss={() => setAlertsDismissed(true)} />
        )}
        <main id="main-content" className="app-main" aria-label={pageTitle}>
          {children}
        </main>
        <BottomNavigation activePath={activePath} onNavigate={onNavigate} />
      </div>
      <QuickEntryFab onOpen={() => setQuickEntryOpen(true)} />
      <QuickEntryForm
        isOpen={quickEntryOpen}
        onClose={() => setQuickEntryOpen(false)}
        onSubmit={handleQuickEntrySubmit}
      />
      <InstallBanner />
      <KeyboardShortcutsModal isOpen={showHelp} onClose={closeKeyboardShortcuts} />
    </div>
  );
};

export default AppLayout;
