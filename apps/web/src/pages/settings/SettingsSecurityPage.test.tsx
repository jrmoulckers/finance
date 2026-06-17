// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isDemoMode: false,
  }),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useStorageDiagnostics: () => null,
}));

vi.mock('../../db/encryption', () => ({
  isEncryptionSupported: () => true,
}));

vi.mock('../../db/sync/powersync-client', () => ({
  getPowerSyncConfig: () => ({
    enabled: false,
    instanceUrl: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
  }),
}));

import { SettingsSecurityPage } from './SettingsSecurityPage';

describe('SettingsSecurityPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the security and encryption details center', () => {
    render(<SettingsSecurityPage />);

    expect(
      screen.getByRole('heading', { name: 'Security & Encryption', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Security Checkup')).toBeInTheDocument();
    expect(screen.getByText('At-Rest Encryption')).toBeInTheDocument();
  });
});
