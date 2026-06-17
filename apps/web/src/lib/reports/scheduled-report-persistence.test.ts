// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createPersistedReportExportMetadata,
  expireReportExportMetadata,
  recordReportDeliveryAttempt,
  summarizeDeliveryAttempts,
} from './scheduled-report-persistence';

describe('scheduled report persistence', () => {
  it('stores audit-safe export metadata without sensitive URLs', () => {
    const metadata = createPersistedReportExportMetadata({
      id: 'export-1',
      reportId: 'report-1',
      generatedAt: '2026-06-01T00:00:00Z',
      ttlDays: 7,
      storageKey: 'reports/export-1',
      formats: ['csv', 'html'],
      rowCount: 4,
      encrypted: true,
    });

    expect(metadata.containsSensitiveUrlData).toBe(false);
    expect(metadata.expiresAt).toBe('2026-06-08T00:00:00.000Z');
    expect(expireReportExportMetadata(metadata).retentionClass).toBe('expired');
  });

  it('rejects URL storage keys and summarizes delivery attempts', () => {
    expect(() =>
      createPersistedReportExportMetadata({
        id: 'bad',
        reportId: 'report-1',
        generatedAt: '2026-06-01T00:00:00Z',
        ttlDays: 7,
        storageKey: 'https://example.test/report.csv',
        formats: ['csv'],
        rowCount: 1,
      }),
    ).toThrow('must not place sensitive report data in URLs');

    const attempts = [
      recordReportDeliveryAttempt({ id: 'a1', exportId: 'export-1', attemptedAt: '2026-06-01T01:00:00Z', status: 'queued' }),
      recordReportDeliveryAttempt({ id: 'a2', exportId: 'export-1', attemptedAt: '2026-06-01T02:00:00Z', status: 'failed', errorClass: 'provider_unavailable', retryCount: 1 }),
    ];

    expect(attempts[1].safeSummary).toContain('provider_unavailable');
    expect(summarizeDeliveryAttempts(attempts)).toMatchObject({ queued: 1, failed: 1 });
  });
});
