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
  useBreakpoint: vi.fn(),
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    dismiss: vi.fn(),
    clearDismissed: vi.fn(),
    addNotification: vi.fn(),
    addNotifications: vi.fn(),
  }),
  useTransactions: () => ({
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  }),
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
  buildNavShortcutCategory: () => null,
}));

vi.mock('../../contexts/PrivacyModeContext', () => ({
  usePrivacyMode: () => ({
    isPrivacyMode: false,
    togglePrivacyMode: vi.fn(),
    setPrivacyMode: vi.fn(),
    maskValue: (v: string) => v,
  }),
}));

import { useBreakpoint, useKeyboardShortcuts } from '../../hooks';
import { AppLayout } from './AppLayout';

const mockSetShowHelp = vi.fn();

/** Set the mocked breakpoint. Header quick actions render only on mobile. */
function mockBreakpoint(kind: 'mobile' | 'tablet' | 'desktop') {
  vi.mocked(useBreakpoint).mockReturnValue({
    breakpoint: kind,
    isMobile: kind === 'mobile',
    isTablet: kind === 'tablet',
    isDesktop: kind === 'desktop',
  });
}

describe('AppLayout', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(useKeyboardShortcuts).mockReturnValue({
      showHelp: false,
      setShowHelp: mockSetShowHelp,
      shortcutCategories: [],
      singleKeyShortcutsEnabled: true,
    });
    mockBreakpoint('mobile');
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

  it('renders a skip-to-navigation link targeting the primary nav landmark', () => {
    renderLayout();

    const skipNav = screen.getByText('Skip to navigation');
    expect(skipNav).toBeInTheDocument();
    expect(skipNav).toHaveAttribute('href', '#primary-navigation');

    const primaryNav = screen.getByRole('navigation', { name: 'Primary' });
    expect(primaryNav).toHaveAttribute('id', 'primary-navigation');
  });

  it('renders a main landmark with the page title as aria-label', () => {
    renderLayout({ pageTitle: 'Budgets' });

    const main = screen.getByRole('main', { name: 'Budgets' });
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
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

  it('renders a discoverable, labeled hide-amounts toggle in the header', () => {
    renderLayout();

    const header = screen.getByRole('banner', { name: 'App header' });
    const toggle = within(header).getByRole('button', { name: 'Hide amounts' });

    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('title', 'Hide amounts');
    // The abstract circle glyph was replaced with a recognizable eye icon.
    expect(toggle.querySelector('svg')).not.toBeNull();
    expect(toggle.textContent).not.toContain('○');
  });

  it('renders the notifications bell in the header on mobile', () => {
    renderLayout();

    const header = screen.getByRole('banner', { name: 'App header' });
    expect(within(header).getByRole('button', { name: /notifications/i })).toBeInTheDocument();
  });

  it('relocates the hide-amounts toggle and notifications out of the header at ≥768px (#3197)', () => {
    mockBreakpoint('desktop');
    renderLayout();

    const header = screen.getByRole('banner', { name: 'App header' });
    // At ≥768px the header is display:none and its quick actions move to the
    // sidebar. They must NOT be duplicated in the (hidden) header DOM, otherwise
    // Playwright strict-mode locators match two nodes with the same name (#3197).
    expect(within(header).queryByRole('button', { name: 'Hide amounts' })).not.toBeInTheDocument();
    expect(
      within(header).queryByRole('button', { name: /notifications/i }),
    ).not.toBeInTheDocument();
    // Non-relocated header actions stay put.
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

  it('nests notice banners inside the content column (.app-shell) so they do not break the desktop layout row (#3537)', () => {
    const { container } = renderLayout();

    const shell = container.querySelector('.app-shell');
    const installBanner = screen.getByTestId('install-banner');

    expect(shell).not.toBeNull();
    // The banners must live inside `.app-shell`, not as siblings of it. When
    // they were direct children of `.app-layout` (a flex row at >=768px), they
    // were pulled into the row and squished the main content into the left half
    // of the viewport. Keeping them inside the column guarantees full width.
    expect(shell?.contains(installBanner)).toBe(true);
  });

  it('applies the simple-mode route plan to core route content', () => {
    localStorage.setItem('finance-simplified-mode', 'true');

    render(<AppLayout {...defaultProps} activePath="/transactions" pageTitle="Transactions" />);

    const main = screen.getByRole('main', { name: 'Transactions' });
    expect(main).toHaveAttribute('data-simple-mode', 'true');
    expect(main).toHaveAttribute('data-simple-mode-surface', 'transactions');
    expect(
      screen.getByRole('region', { name: /transactions simple mode plan/i }),
    ).toHaveTextContent('Primary action: Add transaction.');
  });
});
