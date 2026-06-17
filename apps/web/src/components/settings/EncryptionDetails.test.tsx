// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isDemoMode: false,
  }),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useStorageDiagnostics: () => ({
    backend: 'indexeddb',
    opfsAvailable: true,
    didFallback: true,
    quotaBytes: null,
    usageBytes: null,
  }),
}));

vi.mock('../../db/encryption', () => ({
  isEncryptionSupported: () => true,
}));

vi.mock('../../db/sync/powersync-client', () => ({
  getPowerSyncConfig: () => ({
    enabled: true,
    instanceUrl: 'https://sync.eu.finance.test',
    supabaseUrl: 'https://db.eu.finance.test',
    supabaseAnonKey: 'anon',
  }),
}));

import { EncryptionDetails } from './EncryptionDetails';

describe('EncryptionDetails', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finance-last-sync-time', '2026-06-01T12:00:00.000Z');
    localStorage.setItem(
      'finance-audit-log',
      JSON.stringify([
        {
          id: 'evt-1',
          timestamp: '2026-06-01T11:30:00.000Z',
          eventType: 'login',
          severity: 'info',
          description: 'Signed in with password',
          metadata: {},
          ipAddress: null,
          userAgent: 'Vitest',
        },
      ]),
    );
  });

  it('renders the security checkup and transparency caveats', () => {
    render(<EncryptionDetails />);

    expect(screen.getByText('Security Checkup')).toBeInTheDocument();
    expect(screen.getByText(/PBKDF2-SHA-256 · 600K iterations/i)).toBeInTheDocument();
    expect(screen.getAllByText(/App-managed certificate pinning/i).length).toBeGreaterThan(0);

    const inTransitSummary = screen.getByText('In-Transit Encryption').closest('summary');
    expect(inTransitSummary).not.toBeNull();
    fireEvent.click(inTransitSummary as HTMLElement);

    expect(
      screen.getByText(/Configured endpoints: Supabase: db.eu.finance.test/i),
    ).toBeInTheDocument();
  });

  it('shows recent security activity and audit entries', () => {
    render(<EncryptionDetails />);

    const auditSummary = screen.getByText('Audit Log').closest('summary');
    expect(auditSummary).not.toBeNull();
    fireEvent.click(auditSummary as HTMLElement);

    expect(screen.getByText('Recent local audit entries')).toBeInTheDocument();
    expect(screen.getAllByText('Signed in with password').length).toBeGreaterThan(0);
    expect(screen.getByText(/Last successful sync/i)).toBeInTheDocument();
  });
});
