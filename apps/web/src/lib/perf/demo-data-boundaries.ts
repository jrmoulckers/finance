// SPDX-License-Identifier: BUSL-1.1

export interface DemoRecordMetadata {
  readonly isDemo?: boolean;
}

export interface DemoGuardedRecord {
  readonly id: string;
  readonly metadata?: DemoRecordMetadata;
  readonly syncPolicy?: 'remote' | 'local-only';
  readonly exportPolicy?: 'include' | 'exclude-by-default';
}

export interface DemoGuardResult<T extends DemoGuardedRecord> {
  readonly allowed: readonly T[];
  readonly blockedDemoIds: readonly string[];
}

export interface DemoGuardTelemetryEvent {
  readonly name: 'demo-data-blocked';
  readonly blockedCount: number;
  readonly surface: 'sync' | 'export';
}

export function isDemoRecord(record: DemoGuardedRecord): boolean {
  return (
    record.metadata?.isDemo === true ||
    record.syncPolicy === 'local-only' ||
    record.exportPolicy === 'exclude-by-default'
  );
}

export function filterDemoRecordsForSync<T extends DemoGuardedRecord>(
  records: readonly T[],
): DemoGuardResult<T> {
  return partitionDemoRecords(
    records,
    (record) => record.metadata?.isDemo === true || record.syncPolicy === 'local-only',
  );
}

export function filterDemoRecordsForExport<T extends DemoGuardedRecord>(
  records: readonly T[],
): DemoGuardResult<T> {
  return partitionDemoRecords(
    records,
    (record) => record.metadata?.isDemo === true || record.exportPolicy === 'exclude-by-default',
  );
}

export function createDemoGuardTelemetryEvent(
  result: DemoGuardResult<DemoGuardedRecord>,
  surface: DemoGuardTelemetryEvent['surface'],
  hasAnalyticsConsent: boolean,
): DemoGuardTelemetryEvent | null {
  if (!hasAnalyticsConsent || result.blockedDemoIds.length === 0) return null;
  return {
    name: 'demo-data-blocked',
    blockedCount: result.blockedDemoIds.length,
    surface,
  };
}

function partitionDemoRecords<T extends DemoGuardedRecord>(
  records: readonly T[],
  shouldBlock: (record: T) => boolean,
): DemoGuardResult<T> {
  const allowed: T[] = [];
  const blockedDemoIds: string[] = [];

  for (const record of records) {
    if (shouldBlock(record)) {
      blockedDemoIds.push(record.id);
    } else {
      allowed.push(record);
    }
  }

  return { allowed, blockedDemoIds };
}
