// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createDemoGuardTelemetryEvent,
  filterDemoRecordsForExport,
  filterDemoRecordsForSync,
  isDemoRecord,
  type DemoGuardedRecord,
} from '../demo-data-boundaries';

const records: readonly DemoGuardedRecord[] = [
  { id: 'real-1', syncPolicy: 'remote', exportPolicy: 'include' },
  { id: 'demo-1', metadata: { isDemo: true }, syncPolicy: 'local-only' },
  { id: 'demo-export', exportPolicy: 'exclude-by-default' },
];

describe('demo data boundaries', () => {
  it('blocks demo and local-only records from sync uploads', () => {
    const result = filterDemoRecordsForSync(records);

    expect(result.allowed.map((record) => record.id)).toEqual(['real-1', 'demo-export']);
    expect(result.blockedDemoIds).toEqual(['demo-1']);
  });

  it('excludes demo records from export flows by default', () => {
    const result = filterDemoRecordsForExport(records);

    expect(result.allowed.map((record) => record.id)).toEqual(['real-1']);
    expect(result.blockedDemoIds).toEqual(['demo-1', 'demo-export']);
    expect(isDemoRecord(records[1])).toBe(true);
  });

  it('creates only consented local telemetry contracts', () => {
    const result = filterDemoRecordsForExport(records);

    expect(createDemoGuardTelemetryEvent(result, 'export', false)).toBeNull();
    expect(createDemoGuardTelemetryEvent(result, 'export', true)).toEqual({
      name: 'demo-data-blocked',
      blockedCount: 2,
      surface: 'export',
    });
  });
});
