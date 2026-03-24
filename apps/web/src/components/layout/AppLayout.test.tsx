// SPDX-License-Identifier: MIT

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../accessibility/CognitiveAccessibilityProvider', () => ({
  useCognitiveAccessibility: () => ({
    isSimplified: false,
    getLabel: (original: string) => original,
  }),
  SIMPLIFIED_NAV_PATHS: new Set(['/', '/dashboard', '/transactions', '/budgets', '/settings']),
}));

vi.mock('../../hooks', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('../common', () => ({
  KeyboardShortcutsModal: ({ isOpen }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="keyboard-shortcuts-modal">Shortcuts Modal</div> : null,
  UpdateBanner: () => <div data-testid="update-banner">Update Banner</div>,
}));

vi.mock('../OfflineBanner', () => ({
  OfflineBanner: () => <div data-testid="offline-banner">Offline Banner</div>,
}));

vi.mock('../common/InstallBanner', () => ({
  InstallBanner: () => <div data-testid="install-banner">Install Banner</div>,
}));

import { useKeyboardShortcuts } from '../../hooks';
import { AppLayout } from './AppLayout';

const mockSetShowHelp = vi.fn();

describe('AppLayout', () => {
  beforeEach(() => {
    vi.mocked(useKeyboardShortcuts).mockReturnValue({
      showHelp: false,
      setShowHelp: mockSetShowHelp,
    });
    mockSetShowHelp.mockClear();
  });

  const defaultProps = {
    activePath: '/',
    onNavigate: vi.fn(),
    pageTitle: 'Dashboard',
    children: <div>Page content</div>,
  };

  it('renders children inside the main content area', () => {
    render(<AppLayout {...defaultProps} />);

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent('Page content');
  });

  it('renders the page title in the header', () => {
    render(<AppLayout {...defaultProps} pageTitle="Accounts" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Accounts' })).toBeInTheDocument();
  });

  it('renders a skip-to-content link targeting #main-content', () => {
    render(<AppLayout {...defaultProps} />);

    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });

  it('renders a main landmark with the page title as aria-label', () => {
    render(<AppLayout {...defaultProps} pageTitle="Budgets" />);

    const main = screen.getByRole('main', { name: 'Budgets' });
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  it('renders the sidebar navigation', () => {
    render(<AppLayout {...defaultProps} />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('renders the bottom navigation', () => {
    render(<AppLayout {...defaultProps} />);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders a Settings button in the header', () => {
    render(<AppLayout {...defaultProps} />);

    const header = screen.getByRole('banner', { name: 'App header' });
    expect(within(header).getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('navigates to /settings when the header Settings button is clicked', () => {
    const onNavigate = vi.fn();
    render(<AppLayout {...defaultProps} onNavigate={onNavigate} />);

    const header = screen.getByRole('banner', { name: 'App header' });
    fireEvent.click(within(header).getByRole('button', { name: 'Settings' }));

    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('renders a Keyboard shortcuts button in the header', () => {
    render(<AppLayout {...defaultProps} />);

    const shortcutsButton = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    expect(shortcutsButton).toBeInTheDocument();
    expect(shortcutsButton).toHaveAttribute('aria-keyshortcuts', 'Shift+/');
  });

  it('opens keyboard shortcuts modal when the header button is clicked', () => {
    render(<AppLayout {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));

    expect(mockSetShowHelp).toHaveBeenCalledWith(true);
  });

  it('renders the header with an accessible label', () => {
    render(<AppLayout {...defaultProps} />);

    expect(screen.getByRole('banner', { name: 'App header' })).toBeInTheDocument();
  });

  it('renders the UpdateBanner', () => {
    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('update-banner')).toBeInTheDocument();
  });

  it('renders the OfflineBanner', () => {
    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();
  });

  it('renders the InstallBanner', () => {
    render(<AppLayout {...defaultProps} />);

    expect(screen.getByTestId('install-banner')).toBeInTheDocument();
  });
});
