// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCOUNT_DELETION_DOMAINS,
  deletionResult,
  serializeDeletionReceipt,
  verifyAccountDeletion,
} from './deletion-verification';

describe('deletion verification helpers', () => {
  it('verifies complete server and local deletion coverage', () => {
    const result = verifyAccountDeletion({
      requestId: 'delete-1',
      requestedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:01:00.000Z',
      serverConfirmed: true,
      domains: DEFAULT_ACCOUNT_DELETION_DOMAINS.map((domain) => deletionResult(domain, 'deleted')),
    });

    expect(result.verified).toBe(true);
    expect(result.missingDomains).toEqual([]);
    expect(result.receipt.deletedDomains).toContain('local-opfs');
    expect(serializeDeletionReceipt(result.receipt)).toContain('account_deletion_receipt');
  });

  it('flags missing, failed, retained, and unconfirmed deletion paths', () => {
    const result = verifyAccountDeletion({
      requestId: 'delete-2',
      requestedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:01:00.000Z',
      serverConfirmed: false,
      requiredDomains: ['server-account', 'local-opfs', 'audit-log'],
      domains: [
        deletionResult('server-account', 'deleted'),
        deletionResult('local-opfs', 'failed', 'OPFS unavailable'),
        deletionResult('consent-records', 'retained', 'legal basis receipt'),
      ],
    });

    expect(result.verified).toBe(false);
    expect(result.missingDomains).toEqual(['audit-log']);
    expect(result.failedDomains).toEqual(['local-opfs']);
    expect(result.receipt.failures).toEqual([{ domain: 'local-opfs', error: 'OPFS unavailable' }]);
    expect(result.receipt.retained).toEqual([
      { domain: 'consent-records', retainedReason: 'legal basis receipt' },
    ]);
  });
});
