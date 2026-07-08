// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { AppNotification } from '../../lib/notifications';
import FeedbackDialog from '../FeedbackDialog';
import { KeyboardShortcutsModal, SyncStatusBar } from '../common';
import { CommandPalette, type CommandPaletteAction } from '../common/CommandPalette';
import { ConflictResolutionDialog } from '../common/ConflictResolutionDialog';
import { NotificationCenter } from '../notifications';
import { useBreakpoint, useKeyboardShortcuts } from '../../hooks';
import { useAccessibility } from '../../hooks/useAccessibility';
import { useHiddenModules } from '../../hooks/useModuleVisibility';
import { usePrivacyMode } from '../../contexts/PrivacyModeContext';
import { HiddenModulesContext } from '../../contexts/HiddenModulesContext';
import { useEscapeBack } from '../../hooks/useEscapeBack';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import {
  getStoredSimplifiedModePreference,
  SIMPLIFIED_MODE_STORAGE_KEY,
} from '../../lib/accessibility-preferences';
import { getSimpleModePlan, type SimpleModeSurface } from '../../lib/a11y/simple-mode';

import { BottomNavigation, SidebarNavigation } from './Navigation';
import { getVisibleNavItems } from './navConfig';
import { InstallBanner } from '../common/InstallBanner';
import { SampleDataBanner } from '../common/SampleDataBanner';
import { LegalLinks } from '../legal/LegalLinks';
import { Breadcrumbs, NavShortcuts, buildNavShortcutCategory } from '../navigation';

import { SkipToContent } from './SkipToContent';
import { EyeIcon, EyeOffIcon } from './navIcons';

export interface AppLayoutProps {
  activePath: string;
  onNavigate: (path: string) => void;
  pageTitle: string;
  children: React.ReactNode;
  notifications?: readonly AppNotification[];
  notificationUnreadCount?: number;
  onMarkNotificationAsRead?: (id: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onDismissNotification?: (id: string) => void;
  onNotificationAction?: (notification: AppNotification) => void;
}

const SIMPLE_MODE_SURFACES: Array<{ surface: SimpleModeSurface; paths: readonly string[] }> = [
  { surface: 'dashboard', paths: ['/', '/dashboard'] },
  { surface: 'transactions', paths: ['/transactions'] },
  { surface: 'budgets', paths: ['/budgets'] },
  { surface: 'bills', paths: ['/bills'] },
  { surface: 'goals', paths: ['/goals'] },
  { surface: 'reports', paths: ['/report-builder', '/cash-flow', '/net-worth', '/insights'] },
  { surface: 'settings', paths: ['/settings'] },
];

function getSimpleModeSurface(pathname: string): SimpleModeSurface | null {
  return (
    SIMPLE_MODE_SURFACES.find(({ paths }) =>
      paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)),
    )?.surface ?? null
  );
}

const NAV_SHORTCUT_BY_ID: Record<string, string> = {
  dashboard: 'G D',
  accounts: 'G A',
  transactions: 'G T',
  budgets: 'G B',
  goals: 'G G',
  investments: 'G I',
  bills: 'G L',
  categories: 'G C',
  'cash-flow': 'G F',
  'net-worth': 'G N',
  reports: 'G R',
  watchlists: 'G W',
  household: 'G H',
  import: 'G M',
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  activePath,
  onNavigate,
  pageTitle,
  children,
  notifications = [],
  notificationUnreadCount = 0,
  onMarkNotificationAsRead = () => undefined,
  onMarkAllNotificationsAsRead = () => undefined,
  onDismissNotification = () => undefined,
  onNotificationAction,
}) => {
  const { isPrivacyMode, togglePrivacyMode } = usePrivacyMode();
  // The `.app-header` is `display:none` at ≥768px, so its quick actions are
  // rendered here only on mobile; the desktop sidebar hosts them instead. Gating
  // by breakpoint keeps exactly one instance of each control in the DOM (#3197).
  const { isMobile } = useBreakpoint();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [simpleModeEnabled, setSimpleModeEnabled] = useState(getStoredSimplifiedModePreference);
  const { isSimplified } = useAccessibility();
  // Minimalist mode (#2122): resolve the user's hidden modules once at the
  // layout level and share them via context so eager, performance-budgeted
  // route chunks (e.g. the dashboard) can read them without bundling the
  // module-visibility catalogue/hook.
  const hiddenModuleIds = useHiddenModules();
  const shortcutItems = useMemo(() => getVisibleNavItems(isSimplified), [isSimplified]);
  const navShortcutCategory = useMemo(
    () => buildNavShortcutCategory(shortcutItems),
    [shortcutItems],
  );
  const { showHelp, setShowHelp, singleKeyShortcutsEnabled } = useKeyboardShortcuts({
    onNavigate,
    onNewTransaction: () => onNavigate('/transactions?new=transaction'),
    onOpenCommandPalette: () => setShowCommandPalette(true),
    onTogglePrivacyMode: togglePrivacyMode,
  });
  const { conflictCount } = useSyncStatus();
  const [showConflicts, setShowConflicts] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const simpleModeSurface = getSimpleModeSurface(activePath);
  const simpleModePlan =
    simpleModeEnabled && simpleModeSurface ? getSimpleModePlan(simpleModeSurface) : null;

  useEffect(() => {
    setSimpleModeEnabled(getStoredSimplifiedModePreference());
  }, [activePath]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SIMPLIFIED_MODE_STORAGE_KEY) {
        setSimpleModeEnabled(getStoredSimplifiedModePreference());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Navigate back on Escape key for detail pages (#1523)
  useEscapeBack();

  const openKeyboardShortcuts = useCallback(() => {
    setShowHelp(true);
  }, [setShowHelp]);

  const closeKeyboardShortcuts = useCallback(() => {
    setShowHelp(false);
  }, [setShowHelp]);

  const openCommandPalette = useCallback(() => {
    setShowCommandPalette(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setShowCommandPalette(false);
  }, []);

  const openNewTransaction = useCallback(() => {
    onNavigate('/transactions?new=transaction');
  }, [onNavigate]);

  const goToSettings = useCallback(() => {
    onNavigate('/settings');
  }, [onNavigate]);

  const openConflictDialog = useCallback(() => {
    setShowConflicts(true);
  }, []);

  const closeConflictDialog = useCallback(() => {
    setShowConflicts(false);
  }, []);

  const commandPaletteActions = useMemo<CommandPaletteAction[]>(
    () => [
      ...shortcutItems.map((item) => ({
        id: `command-nav-${item.id}`,
        label: `Go to ${item.label}`,
        description: item.description,
        keywords: `${item.group ?? 'primary'} ${item.href}`,
        shortcut: NAV_SHORTCUT_BY_ID[item.id],
        perform: () => onNavigate(item.href),
      })),
      {
        id: 'command-new-transaction',
        label: 'Add transaction',
        description: 'Open manual transaction entry.',
        shortcut: 'N',
        keywords: 'new quick add create transaction',
        perform: openNewTransaction,
      },
      {
        id: 'command-shortcuts',
        label: 'Show keyboard shortcuts',
        description: 'Open the shortcuts reference overlay.',
        shortcut: '?',
        keywords: 'help keyboard shortcuts',
        perform: openKeyboardShortcuts,
      },
      {
        id: 'command-toggle-privacy',
        label: isPrivacyMode ? 'Turn privacy mode off' : 'Turn privacy mode on',
        description: 'Mask or reveal financial amounts.',
        shortcut: 'Ctrl+Shift+P',
        keywords: 'privacy mask sensitive amounts hide show balances values',
        perform: togglePrivacyMode,
      },
      {
        id: 'command-settings-preferences',
        label: 'Open preferences',
        description: 'Theme, density, currency, and display settings.',
        shortcut: 'G S',
        keywords: 'settings display density theme compact',
        perform: () => onNavigate('/settings/preferences'),
      },
    ],
    [
      isPrivacyMode,
      onNavigate,
      openKeyboardShortcuts,
      openNewTransaction,
      shortcutItems,
      togglePrivacyMode,
    ],
  );

  const openFeedbackDialog = useCallback(() => {
    setShowFeedback(true);
  }, []);

  const closeFeedbackDialog = useCallback(() => {
    setShowFeedback(false);
  }, []);

  return (
    <div className="app-layout">
      <SkipToContent />
      <SidebarNavigation
        activePath={activePath}
        onNavigate={onNavigate}
        onOpenShortcuts={openKeyboardShortcuts}
        onOpenFeedback={openFeedbackDialog}
        simpleMode={simpleModeEnabled}
        showQuickActions={!isMobile}
        notifications={notifications}
        notificationUnreadCount={notificationUnreadCount}
        onMarkNotificationAsRead={onMarkNotificationAsRead}
        onMarkAllNotificationsAsRead={onMarkAllNotificationsAsRead}
        onDismissNotification={onDismissNotification}
        onNotificationAction={onNotificationAction}
        isPrivacyMode={isPrivacyMode}
        onTogglePrivacyMode={togglePrivacyMode}
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
            {isMobile ? (
              <>
                <button
                  type="button"
                  className={`icon-button${isPrivacyMode ? ' icon-button--active' : ''}${isSimplified ? ' icon-button--labeled' : ''}`}
                  aria-label={isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
                  aria-pressed={isPrivacyMode}
                  title={isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
                  onClick={togglePrivacyMode}
                >
                  {isPrivacyMode ? <EyeOffIcon /> : <EyeIcon />}
                  <span className="icon-button__label">
                    {isPrivacyMode ? 'Show amounts' : 'Hide amounts'}
                  </span>
                </button>
                <NotificationCenter
                  notifications={notifications}
                  unreadCount={notificationUnreadCount}
                  onMarkAsRead={onMarkNotificationAsRead}
                  onMarkAllAsRead={onMarkAllNotificationsAsRead}
                  onDismiss={onDismissNotification}
                  onAction={onNotificationAction}
                  onViewAll={() => onNavigate('/notifications')}
                />
              </>
            ) : null}
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
              className="icon-button"
              aria-label="Command palette"
              aria-keyshortcuts="Control+K Meta+K /"
              onClick={openCommandPalette}
            >
              <span className="icon-button__glyph" aria-hidden="true">
                ⌘K
              </span>
            </button>
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
        <main
          id="main-content"
          className="app-main"
          aria-label={pageTitle}
          tabIndex={-1}
          data-simple-mode={simpleModeEnabled || undefined}
          data-simple-mode-surface={simpleModePlan?.surface}
        >
          {simpleModePlan && (
            <section
              className="simple-mode-summary"
              aria-label={`${simpleModePlan.heading} simple mode plan`}
              data-simple-mode-plan={simpleModePlan.surface}
            >
              <p>
                <strong>Simple Mode:</strong> {simpleModePlan.heading}. Primary action:{' '}
                {simpleModePlan.primaryAction}.
              </p>
              <p className="sr-only">
                Visible regions: {simpleModePlan.visibleRegions.join(', ')}. Advanced regions
                collapsed: {simpleModePlan.collapsedRegions.join(', ')}.
              </p>
            </section>
          )}
          <HiddenModulesContext.Provider value={hiddenModuleIds}>
            {children}
          </HiddenModulesContext.Provider>
        </main>
        <footer className="app-footer">
          <LegalLinks />
        </footer>
        <BottomNavigation
          activePath={activePath}
          onNavigate={onNavigate}
          onOpenFeedback={openFeedbackDialog}
          simpleMode={simpleModeEnabled}
        />
        {/* Notice banners live inside the content column (`.app-shell`) so they
            render full-width at the bottom of the content on every breakpoint.
            Rendering them as siblings of `.app-shell` pulled them into the
            `.app-layout` flex row at >=768px, squishing the main content into
            the left half of the viewport (#3537). */}
        <InstallBanner />
        <SampleDataBanner />
      </div>
      <CommandPalette
        isOpen={showCommandPalette}
        actions={commandPaletteActions}
        onClose={closeCommandPalette}
      />
      <KeyboardShortcutsModal
        isOpen={showHelp}
        onClose={closeKeyboardShortcuts}
        singleKeyShortcutsEnabled={singleKeyShortcutsEnabled}
        extraCategories={navShortcutCategory ? [navShortcutCategory] : undefined}
      />
      {/* Headless: registers the always-on Ctrl+1..9 nav shortcuts. Its
          reference list is folded into the single KeyboardShortcutsModal above
          so "?" opens exactly one dialog (#3329, #3347). */}
      <NavShortcuts onNavigate={onNavigate} items={shortcutItems} />
      <ConflictResolutionDialog isOpen={showConflicts} onClose={closeConflictDialog} />
      <FeedbackDialog isOpen={showFeedback} onClose={closeFeedbackDialog} />
    </div>
  );
};

export default AppLayout;
