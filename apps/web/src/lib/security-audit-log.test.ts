// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SECURITY_AUDIT_LOG_KEY,
  appendSecurityAuditEvent,
  exportSecurityAuditLog,
  loadSecurityAuditLog,
  verifySecurityAuditLogIntegrity,
} from './security-audit-log';

describe('security-audit-log', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('creates ordered hash-chained audit events without raw secrets', async () => {
    const first = await appendSecurityAuditEvent({
      action: 'data_export_generated',
      result: 'success',
      metadata: { selectedDomains: ['accounts'], accessToken: 'secret-token' },
      timestamp: '2026-05-26T12:00:00.000Z',
    });
    const second = await appendSecurityAuditEvent({
      action: 'privacy_mode_toggled',
      result: 'success',
      metadata: { enabled: true },
      timestamp: '2026-05-26T12:01:00.000Z',
    });

    expect(second.previousHash).toBe(first.hash);
    expect(loadSecurityAuditLog()[0].metadata.accessToken).toBe('[redacted]');
    await expect(verifySecurityAuditLogIntegrity()).resolves.toMatchObject({
      ok: true,
      checked: 2,
    });
  });

  it('detects tampering in stored events', async () => {
    await appendSecurityAuditEvent({
      action: 'third_party_permission_revoked',
      result: 'success',
      metadata: { connectionId: 'bank-1' },
    });
    const events = loadSecurityAuditLog();
    localStorage.setItem(
      SECURITY_AUDIT_LOG_KEY,
      JSON.stringify([{ ...events[0], action: 'account_deletion_completed' }]),
    );

    await expect(verifySecurityAuditLogIntegrity()).resolves.toMatchObject({ ok: false });
  });

  it('exports a portable audit payload', async () => {
    await appendSecurityAuditEvent({ action: 'session_timeout', result: 'success' });

    expect(JSON.parse(exportSecurityAuditLog())).toMatchObject({
      type: 'security_audit_log',
      totalEvents: 1,
    });
  });
});
