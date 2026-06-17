// SPDX-License-Identifier: BUSL-1.1

export type ReportExportRetentionClass = 'ephemeral' | 'encrypted-local' | 'expired';
export type ReportDeliveryAttemptStatus = 'queued' | 'sent' | 'failed' | 'retry_scheduled';

export interface PersistedReportExportMetadata {
  readonly id: string;
  readonly reportId: string;
  readonly scheduleId?: string;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly storageKey: string;
  readonly formats: readonly ('csv' | 'html')[];
  readonly rowCount: number;
  readonly retentionClass: ReportExportRetentionClass;
  readonly containsSensitiveUrlData: false;
}

export interface ReportDeliveryAttemptRecord {
  readonly id: string;
  readonly exportId: string;
  readonly attemptedAt: string;
  readonly status: ReportDeliveryAttemptStatus;
  readonly providerMessageId?: string;
  readonly retryCount: number;
  readonly errorClass?: 'temporary' | 'permanent' | 'privacy_blocked' | 'provider_unavailable';
  readonly safeSummary: string;
}

function assertLocalStorageKey(storageKey: string): void {
  if (/^(https?:|data:)/i.test(storageKey)) {
    throw new Error('Report export storage keys must not place sensitive report data in URLs.');
  }
}

export function createPersistedReportExportMetadata(input: {
  readonly id: string;
  readonly reportId: string;
  readonly scheduleId?: string;
  readonly generatedAt: string;
  readonly ttlDays: number;
  readonly storageKey: string;
  readonly formats: readonly ('csv' | 'html')[];
  readonly rowCount: number;
  readonly encrypted?: boolean;
}): PersistedReportExportMetadata {
  assertLocalStorageKey(input.storageKey);
  const expiresAt = new Date(input.generatedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + Math.max(1, Math.floor(input.ttlDays)));
  return {
    id: input.id,
    reportId: input.reportId,
    scheduleId: input.scheduleId,
    generatedAt: input.generatedAt,
    expiresAt: expiresAt.toISOString(),
    storageKey: input.storageKey,
    formats: input.formats,
    rowCount: input.rowCount,
    retentionClass: input.encrypted ? 'encrypted-local' : 'ephemeral',
    containsSensitiveUrlData: false,
  };
}

export function expireReportExportMetadata(
  metadata: PersistedReportExportMetadata,
): PersistedReportExportMetadata {
  return { ...metadata, retentionClass: 'expired' };
}

export function recordReportDeliveryAttempt(input: {
  readonly id: string;
  readonly exportId: string;
  readonly attemptedAt: string;
  readonly status: ReportDeliveryAttemptStatus;
  readonly providerMessageId?: string;
  readonly retryCount?: number;
  readonly errorClass?: ReportDeliveryAttemptRecord['errorClass'];
}): ReportDeliveryAttemptRecord {
  return {
    id: input.id,
    exportId: input.exportId,
    attemptedAt: input.attemptedAt,
    status: input.status,
    providerMessageId: input.providerMessageId,
    retryCount: Math.max(0, Math.floor(input.retryCount ?? 0)),
    errorClass: input.errorClass,
    safeSummary:
      input.status === 'failed'
        ? `Delivery failed with ${input.errorClass ?? 'unknown'} error after ${input.retryCount ?? 0} retry attempt(s).`
        : `Delivery attempt is ${input.status}.`,
  };
}

export function summarizeDeliveryAttempts(
  attempts: readonly ReportDeliveryAttemptRecord[],
): Readonly<Record<ReportDeliveryAttemptStatus, number>> {
  return attempts.reduce<Record<ReportDeliveryAttemptStatus, number>>(
    (counts, attempt) => ({ ...counts, [attempt.status]: counts[attempt.status] + 1 }),
    { queued: 0, sent: 0, failed: 0, retry_scheduled: 0 },
  );
}
