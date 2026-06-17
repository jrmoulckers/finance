// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appendSecurityAuditEventMock,
  clearLocalAccountDataMock,
  closeDatabaseMock,
  getHouseholdDeletionImpactMock,
  logoutMock,
  markStepUpAuthenticatedMock,
  wipeLocalDataMock,
} = vi.hoisted(() => ({
  appendSecurityAuditEventMock: vi.fn(),
  clearLocalAccountDataMock: vi.fn(),
  closeDatabaseMock: vi.fn(),
  getHouseholdDeletionImpactMock: vi.fn(),
  logoutMock: vi.fn(),
  markStepUpAuthenticatedMock: vi.fn(),
  wipeLocalDataMock: vi.fn(),
}));

vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    logout: logoutMock,
    user: { id: 'user-1', email: 'alex@example.com', hasPasskey: true },
  }),
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => ({ close: closeDatabaseMock }),
}));

vi.mock('../../lib/account/account-deletion', () => ({
  clearLocalAccountData: clearLocalAccountDataMock,
  getHouseholdDeletionImpact: getHouseholdDeletionImpactMock,
}));

vi.mock('../../storage/wipeLocalData', () => ({
  wipeLocalData: wipeLocalDataMock,
}));

vi.mock('../../lib/security-audit-log', () => ({
  appendSecurityAuditEvent: appendSecurityAuditEventMock,
}));

vi.mock('../../lib/session-security', () => ({
  getStepUpStatus: () => ({ allowed: true, required: false, expiresAt: null, reason: 'active' }),
  markStepUpAuthenticated: markStepUpAuthenticatedMock,
}));

import { useAccountDeletion } from './AccountDeletionModal';

function TestHost() {
  const { openDeleteModal, deleteModal } = useAccountDeletion();
  return (
    <>
      <button type="button" onClick={openDeleteModal}>
        Delete account
      </button>
      {deleteModal}
    </>
  );
}

describe('AccountDeletionModal receipt flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHouseholdDeletionImpactMock.mockReturnValue({
      soloOwnedHouseholds: 0,
      memberHouseholds: 0,
      pendingInvites: 0,
    });
    clearLocalAccountDataMock.mockResolvedValue(undefined);
    closeDatabaseMock.mockResolvedValue(undefined);
    logoutMock.mockResolvedValue(undefined);
    appendSecurityAuditEventMock
      .mockResolvedValueOnce({ hash: 'attempt-hash' })
      .mockResolvedValueOnce({ hash: 'verification-hash-123' });
    wipeLocalDataMock.mockResolvedValue([
      { area: 'opfs', status: 'not_applicable' },
      { area: 'indexeddb', status: 'deleted' },
      { area: 'caches', status: 'deleted' },
      { area: 'service-workers', status: 'not_applicable' },
      { area: 'local-storage', status: 'deleted' },
      { area: 'session-storage', status: 'deleted' },
      { area: 'sync-queues', status: 'deleted' },
      { area: 'audit-log', status: 'deleted' },
      { area: 'consent-records', status: 'deleted' },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            requestId: 'delete-request-1',
            deletedDomains: [
              'server-account',
              'server-financial-data',
              'server-auth-identities',
              'server-passkeys',
            ],
            failedDomains: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  });

  it('generates, displays, and downloads a verification receipt after deletion completes', async () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignSpy },
    });

    render(<TestHost />);

    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }));
    fireEvent.change(await screen.findByLabelText(/type delete to confirm/i), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: /yes, delete everything/i }));

    expect(await screen.findByRole('heading', { name: /account deletion receipt/i })).toBeInTheDocument();
    expect(screen.getByText('verification-hash-123')).toBeInTheDocument();
    expect(screen.getByText('server-account')).toBeInTheDocument();
    expect(screen.getByText('local-indexeddb')).toBeInTheDocument();

    const downloadLink = screen.getByRole('link', { name: /download receipt/i });
    expect(downloadLink).toHaveAttribute('download', 'finance-account-deletion-receipt-delete-request-1.json');
    expect(downloadLink.getAttribute('href')).toContain(encodeURIComponent('verification-hash-123'));
    expect(screen.getByText(/"type": "account_deletion_receipt"/)).toBeInTheDocument();
    expect(logoutMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /continue to login/i }));
    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    expect(assignSpy).toHaveBeenCalledWith('/login');
  });
});
