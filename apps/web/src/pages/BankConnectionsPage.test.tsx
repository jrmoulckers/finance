// SPDX-License-Identifier: BUSL-1.1

/**
 * Accessibility regression tests for the Bank Connections dashboard tabs
 * (#3862). These lock in the WAI-ARIA Tabs pattern: a labelled tablist, each
 * tab wired to the shared panel, a roving tabindex (single tab stop), automatic
 * activation on Arrow/Home/End, and zero axe-core violations.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBankConnections } from '../hooks/useBankConnections';
import { useConnectorPermissions } from '../hooks/useConnectorPermissions';
import { expectNoAxeViolations } from '../test-utils/axe';
import { BankConnectionsPage } from './BankConnectionsPage';

vi.mock('../hooks/useBankConnections', () => ({
  useBankConnections: vi.fn(),
}));

vi.mock('../hooks/useConnectorPermissions', () => ({
  useConnectorPermissions: vi.fn(),
}));

const mockedUseBankConnections = vi.mocked(useBankConnections);
const mockedUseConnectorPermissions = vi.mocked(useConnectorPermissions);

/** Tab accessible names in DOM order. */
const TAB_NAMES = [
  'Connection Health',
  'Providers',
  'Wallets & Exchanges',
  'Safety Center',
] as const;

function setupHooks(): void {
  mockedUseBankConnections.mockReturnValue({
    connections: [],
    providers: [],
    healthHistory: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    loadHealthHistory: vi.fn(),
  });
  mockedUseConnectorPermissions.mockReturnValue({
    permissions: [],
    accessLog: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    loadAccessLog: vi.fn(),
  });
}

/**
 * Renders the page inside a `<main>` landmark, mirroring the app shell so the
 * page-level axe run isn't tripped by best-practice landmark rules.
 */
function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <main>
        <BankConnectionsPage />
      </main>
    </MemoryRouter>,
  );
}

const getTab = (name: string): HTMLElement => screen.getByRole('tab', { name });

describe('BankConnectionsPage — WAI-ARIA Tabs (#3862)', () => {
  beforeEach(() => {
    setupHooks();
  });

  it('renders a labelled tablist containing the four section tabs', () => {
    renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Bank connections sections' });
    const tabs = within(tablist).getAllByRole('tab');

    expect(tabs).toHaveLength(TAB_NAMES.length);
    tabs.forEach((tab, index) => {
      expect(tab).toHaveTextContent(TAB_NAMES[index]);
    });
  });

  it('associates every tab with the shared panel via aria-controls', () => {
    renderPage();

    const panel = screen.getByRole('tabpanel');
    const panelId = panel.getAttribute('id');
    expect(panelId).toBeTruthy();

    for (const name of TAB_NAMES) {
      const tab = getTab(name);
      expect(tab).toHaveAttribute('id');
      expect(tab).toHaveAttribute('aria-controls', panelId);
    }
  });

  it('labels the panel with the active tab and keeps it focusable', () => {
    renderPage();

    const panel = screen.getByRole('tabpanel');
    const activeTab = getTab('Connection Health');

    expect(panel).toHaveAttribute('aria-labelledby', activeTab.getAttribute('id'));
    expect(panel).toHaveAttribute('tabindex', '0');
  });

  it('uses a roving tabindex so only the selected tab is a tab stop', () => {
    renderPage();

    const selected = getTab('Connection Health');
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveAttribute('tabindex', '0');

    for (const name of TAB_NAMES.slice(1)) {
      const tab = getTab(name);
      expect(tab).toHaveAttribute('aria-selected', 'false');
      expect(tab).toHaveAttribute('tabindex', '-1');
    }
  });

  it('activates a tab on click and repoints the panel label', () => {
    renderPage();

    const providers = getTab('Providers');
    fireEvent.click(providers);

    expect(providers).toHaveAttribute('aria-selected', 'true');
    expect(providers).toHaveAttribute('tabindex', '0');
    expect(getTab('Connection Health')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      providers.getAttribute('id'),
    );
  });

  it('moves to the next tab with ArrowRight (automatic activation + focus)', () => {
    renderPage();

    const health = getTab('Connection Health');
    health.focus();
    fireEvent.keyDown(health, { key: 'ArrowRight' });

    const providers = getTab('Providers');
    expect(providers).toHaveAttribute('aria-selected', 'true');
    expect(providers).toHaveAttribute('tabindex', '0');
    expect(providers).toHaveFocus();
  });

  it('wraps to the last tab with ArrowLeft from the first tab', () => {
    renderPage();

    const health = getTab('Connection Health');
    health.focus();
    fireEvent.keyDown(health, { key: 'ArrowLeft' });

    const safety = getTab('Safety Center');
    expect(safety).toHaveAttribute('aria-selected', 'true');
    expect(safety).toHaveFocus();
  });

  it('jumps to the first and last tabs with Home and End', () => {
    renderPage();

    fireEvent.click(getTab('Providers'));

    fireEvent.keyDown(getTab('Providers'), { key: 'End' });
    const safety = getTab('Safety Center');
    expect(safety).toHaveAttribute('aria-selected', 'true');
    expect(safety).toHaveFocus();

    fireEvent.keyDown(safety, { key: 'Home' });
    const health = getTab('Connection Health');
    expect(health).toHaveAttribute('aria-selected', 'true');
    expect(health).toHaveFocus();
  });

  it('has no axe-core accessibility violations', async () => {
    const { container } = renderPage();
    await expectNoAxeViolations(container);
  });
});
