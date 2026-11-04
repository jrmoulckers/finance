// SPDX-License-Identifier: BUSL-1.1

/**
 * Synthetic regressions for #3863/#3864. Static metadata stays readable without
 * live-region fan-out; only a successful user refresh announces its summary.
 * DOM/axe checks do not substitute for native screen-reader speech verification.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { announce } from '../accessibility/aria';
import { useBankConnections, type BankConnectionHealth } from '../hooks/useBankConnections';
import { useConnectorPermissions } from '../hooks/useConnectorPermissions';
import { expectNoAxeViolations } from '../test-utils/axe';
import { BankConnectionsPage } from './BankConnectionsPage';

vi.mock('../hooks/useBankConnections', () => ({ useBankConnections: vi.fn() }));
vi.mock('../hooks/useConnectorPermissions', () => ({ useConnectorPermissions: vi.fn() }));
vi.mock('../accessibility/aria', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../accessibility/aria')>()),
  announce: vi.fn(),
}));

const bankHook = vi.mocked(useBankConnections);
const permissionsHook = vi.mocked(useConnectorPermissions);

const connections: BankConnectionHealth[] = (['healthy', 'stale', 'auth_expired'] as const).map(
  (healthStatus, index) => ({
    id: `synthetic-${index}`,
    provider: 'plaid',
    institutionName: `Example Bank ${index + 1}`,
    connectionStatus: 'active',
    healthStatus,
    stalenessMinutes: index * 60,
    errorCategory: null,
    errorCode: null,
    lastSyncedAt: '2026-11-02T12:00:00Z',
    permissionLevel: 'read_only',
    connectionType: 'aggregator',
    needsReauth: healthStatus === 'auth_expired',
  }),
);

function page() {
  return (
    <MemoryRouter>
      <main>
        <BankConnectionsPage />
      </main>
    </MemoryRouter>
  );
}

function expectStatic(container: HTMLElement) {
  expect(container.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(
    0,
  );
}

describe('Bank Connections announcement and heading regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankHook.mockReturnValue({
      connections,
      providers: ['active', 'degraded'].map((status, index) => ({
        id: `provider-${index}`,
        name: `example-${index}`,
        displayName: `Example Provider ${index + 1}`,
        providerType: 'aggregator',
        status,
        healthScore: 90 - index * 30,
        priority: index,
        isEnabled: false,
        capabilities: {},
        supportedRegions: ['US'],
      })),
      healthHistory: [],
      loading: false,
      historyLoading: false,
      error: null,
      refresh: vi.fn().mockResolvedValue(undefined),
      reloadLocal: vi.fn().mockResolvedValue(undefined),
      loadHealthHistory: vi.fn().mockResolvedValue(undefined),
    });
    permissionsHook.mockReturnValue({
      permissions: [false, true].map((isRevoked, index) => ({
        id: `permission-${index}`,
        bankConnectionId: `synthetic-${index}`,
        permissionLevel: 'read_only',
        grantedScopes: ['transactions'],
        scopeDescriptions: ['Read transactions'],
        isRevoked,
        revokedAt: isRevoked ? '2026-11-02T12:00:00Z' : null,
        tokenStatus: isRevoked ? 'revoked' : 'active',
        tokenExpiresAt: null,
        connection: { provider: 'plaid', institutionName: `Example Bank ${index + 1}` },
        createdAt: '2026-11-01T12:00:00Z',
      })),
      accessLog: [],
      loading: false,
      error: null,
      refresh: vi.fn(),
      loadAccessLog: vi.fn(),
    });
  });

  it('keeps multi-card health and freshness readable but silent on load and updates', async () => {
    const { container, rerender } = render(page());
    expectStatic(container);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(within(screen.getAllByRole('article')[0]).getByText('Healthy')).toBeVisible();
    expect(screen.getByText('1h ago')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Re-authenticate Example Bank 3' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Connection Health', level: 2 })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    bankHook.mockReturnValue({ ...bankHook(), connections: connections.slice(0, 2) });
    rerender(page());
    expectStatic(container);
    expect(announce).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });

  it('keeps providers and safety headings outside live regions, including disclosures', async () => {
    const { container } = render(page());
    fireEvent.click(screen.getByRole('tab', { name: 'Providers' }));
    expectStatic(container);
    expect(screen.getByRole('heading', { name: 'Provider Status', level: 2 })).toBeVisible();
    expect(screen.getByRole('listitem', { name: 'Example Provider 1: active' })).toBeVisible();
    await expectNoAxeViolations(container);
    fireEvent.click(screen.getByRole('tab', { name: 'Safety Center' }));
    expectStatic(container);
    expect(screen.getByRole('heading', { name: 'Safety Center', level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Active Connectors', level: 3 })).toBeVisible();
    const revoked = screen.getByText('Revoked Connectors (1)').closest('summary');
    expect(revoked).not.toBeNull();
    fireEvent.click(revoked!);
    expect(screen.getByRole('heading', { name: 'Revoked Connectors (1)', level: 3 })).toBeVisible();
    fireEvent.click(screen.getByText('View granted permissions (1)'));
    expect(screen.getByText('Read transactions')).toBeVisible();
    await expectNoAxeViolations(container);
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces exactly one concise successful refresh using the final counts, even after switching tabs', async () => {
    let finish!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    bankHook.mockReturnValue({ ...bankHook(), refresh });
    const { container, rerender } = render(page());
    const button = screen.getByRole('button', { name: 'Refresh connection health' });
    fireEvent.click(button);
    expect(button).toHaveAccessibleName('Refresh connection health');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    bankHook.mockReturnValue({ ...bankHook(), loading: true });
    rerender(page());
    expect(screen.getByRole('status')).toHaveTextContent('Loading connections');
    expect(announce).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(screen.getAllByRole('status')).toHaveLength(1);
    bankHook.mockReturnValue({
      ...bankHook(),
      connections: connections.slice(0, 2),
      loading: false,
    });
    await act(async () => {
      finish();
    });
    rerender(page());
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Connections refreshed: 1 healthy, 1 with issues.',
    );
    expectStatic(container);
    fireEvent.click(screen.getByRole('tab', { name: 'Connection Health' }));
    expect(button).toHaveAccessibleName('Refresh connection health');
    expect(screen.getByRole('button', { name: 'Refresh connection health' })).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh connection health' }));
    });
    await act(async () => {
      finish();
    });
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('retains a single refresh error alert across tabs without announcing success', async () => {
    const refresh = vi.fn(async () => {
      bankHook.mockReturnValue({ ...bankHook(), error: 'Could not refresh. Try again.' });
    });
    bankHook.mockReturnValue({ ...bankHook(), refresh });
    const { rerender } = render(page());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh connection health' }));
    });
    rerender(page());
    fireEvent.click(screen.getByRole('tab', { name: 'Providers' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh. Try again.');
    expect(announce).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Connection Health' }));
    expect(screen.getByRole('button', { name: 'Refresh connection health' })).toBeEnabled();
  });

  it.each(['loading', 'empty', 'error'] as const)(
    'preserves h2 headings in %s states',
    async (state) => {
      bankHook.mockReturnValue({ ...bankHook(), providers: [], loading: state === 'loading' });
      permissionsHook.mockReturnValue({
        ...permissionsHook(),
        permissions: [],
        loading: state === 'loading',
        error: state === 'error' ? 'Could not load permissions.' : null,
      });
      const { container } = render(page());
      fireEvent.click(screen.getByRole('tab', { name: 'Providers' }));
      expect(
        within(screen.getByRole('tabpanel')).getByRole('heading', { level: 2 }),
      ).toHaveTextContent('Provider Status');
      if (state === 'loading')
        expect(screen.getByRole('status')).toHaveTextContent('Loading provider status');
      fireEvent.click(screen.getByRole('tab', { name: 'Safety Center' }));
      expect(
        within(screen.getByRole('tabpanel')).getByRole('heading', { level: 2 }),
      ).toHaveTextContent('Safety Center');
      if (state === 'loading')
        expect(screen.getByRole('status')).toHaveTextContent('Loading connector permissions');
      if (state === 'error')
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load permissions.');
      await expectNoAxeViolations(container);
    },
  );
});
