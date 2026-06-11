// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../accessibility/CognitiveAccessibilityProvider', () => ({
  useCognitiveAccessibility: () => ({
    isSimplified: false,
    getLabel: (original: string) => original,
  }),
  SIMPLIFIED_NAV_PATHS: new Set(['/', '/dashboard', '/transactions', '/budgets', '/settings']),
}));

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'test-user', email: 'test@example.com', hasPasskey: false },
    error: null,
    logout: vi.fn(),
  }),
}));

vi.mock('../../hooks', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../../hooks/useEscapeBack', () => ({
  useEscapeBack: vi.fn(),
}));

vi.mock('../../hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({ conflictCount: 0 }),
}));

vi.mock('../common/ConflictResolutionDialog', () => ({
  ConflictResolutionDialog: () => null,
}));

vi.mock('../common', () => ({
  KeyboardShortcutsModal: ({ isOpen }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="keyboard-shortcuts-modal">Shortcuts Modal</div> : null,
  SyncStatusBar: () => <div data-testid="sync-status-bar">Sync Status</div>,
}));

// OfflineBanner removed — SyncStatusBar handles offline state

vi.mock('../common/InstallBanner', () => ({
  InstallBanner: () => <div data-testid="install-banner">Install Banner</div>,
}));

vi.mock('./Navigation', () => ({
  SidebarNavigation: () => <nav aria-label="Primary">Sidebar</nav>,
  BottomNavigation: () => <nav aria-label="Main navigation">Bottom</nav>,
}));

vi.mock('./navConfig', () => ({
  getVisibleNavItems: () => [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { id: 'accounts', label: 'Accounts', href: '/accounts' },
  ],
}));

vi.mock('../navigation', () => ({
  Breadcrumbs: () => null,
  NavShortcuts: () => null,
}));

vi.mock('../../contexts/PrivacyModeContext', () => ({
  usePrivacyMode: () => ({
    isPrivacyMode: false,
    togglePrivacyMode: vi.fn(),
    setPrivacyMode: vi.fn(),
    maskValue: (v: string) => v,
  }),
}));

import { useKeyboardShortcuts } from '../../hooks';
import { AppLayout } from './AppLayout';

const mockSetShowHelp = vi.fn();

describe('AppLayout', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(useKeyboardShortcuts).mockReturnValue({
      showHelp: false,
      setShowHelp: mockSetShowHelp,
      shortcutCategories: [],
    });
    mockSetShowHelp.mockClear();
  });

  const defaultProps = {
    activePath: '/',
    onNavigate: vi.fn(),
    pageTitle: 'Dashboard',
    children: <div>Page content</div>,
  };

  const renderLayout = (props: Partial<typeof defaultProps> = {}) =>
    render(
      <MemoryRouter>
        <AppLayout {...defaultProps} {...props} />
      </MemoryRouter>,
    );

  it('renders children inside the main content area', () => {
    renderLayout();

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('Page content');
  });

  it('renders the page title in the header', () => {
    renderLayout({ pageTitle: 'Accounts' });

    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
  });

  it('renders a skip-to-content link targeting #main-content', () => {
    renderLayout();

    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('renders a main landmark with the page title as aria-label', () => {
    renderLayout({ pageTitle: 'Budgets' });

    const main = screen.getByRole('main', { name: 'Budgets' });
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('renders the sidebar navigation', () => {
    renderLayout();

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('renders the bottom navigation', () => {
    renderLayout();

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders hosted legal links in the app footer', () => {
    renderLayout();

    const legalNav = screen.getByRole('navigation', { name: 'Legal links' });
    expect(within(legalNav).getByRole('link', { name: 'Legal' })).toHaveAttribute('href', '/legal');
    expect(within(legalNav).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
    expect(within(legalNav).getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(within(legalNav).getByRole('link', { name: 'CCPA' })).toHaveAttribute(
      'href',
      '/legal/ccpa',
    );
  });

  it('renders a Settings button in the header', () => {
    renderLayout();

    const header = screen.getByRole('banner', { name: 'App header' });
    expect(within(header).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('navigates to /settings when the header Settings button is clicked', () => {
    const onNavigate = vi.fn();
    renderLayout({ onNavigate });

    const header = screen.getByRole('banner', { name: 'App header' });
    fireEvent.click(within(header).getByRole('button', { name: 'Settings' }));

    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('renders a Keyboard shortcuts button in the header', () => {
    renderLayout();

    const shortcutsButton = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(shortcutsButton).toBeInTheDocument();
    expect(shortcutsButton).toHaveAttribute('aria-keyshortcuts', 'Shift+/');
  });

  it('opens keyboard shortcuts modal when the header button is clicked', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));

    expect(mockSetShowHelp).toHaveBeenCalledWith(true);
  });

  it('renders the header with an accessible label', () => {
    renderLayout();

    expect(screen.getByRole('banner', { name: 'App header' })).toBeInTheDocument();
  });

  it('renders without the removed OfflineBanner (offline state handled by SyncStatusBar)', () => {
    renderLayout();

    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
  });

  it('renders the InstallBanner', () => {
    renderLayout();

    expect(screen.getByTestId('install-banner')).toBeInTheDocument();
  });
});
