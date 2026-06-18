// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for sample-data demo mode generator.
 *
 * References: issue #2296
 */

import { describe, expect, it } from 'vitest';
import {
  createSampleDemoData,
  filterDemoRecordsForExport,
  getDemoResetSummary,
  isDemoRecord,
} from './sample-demo-data';

describe('sample demo data generator', () => {
  it('creates deterministic fictional records tagged as local-only demo data', () => {
    const dataSet = createSampleDemoData({
      now: new Date('2026-04-20T12:00:00.000Z'),
      sessionId: 'Beta User Demo!',
    });

    expect(dataSet.metadata.demoSessionId).toBe('beta-user-demo');
    expect(dataSet.metadata.syncPolicy).toBe('local-only');
    expect(dataSet.metadata.exportPolicy).toBe('exclude-by-default');
    expect(dataSet.accounts).toHaveLength(3);
    expect(dataSet.budgets).toHaveLength(6);
    expect(dataSet.transactions).toHaveLength(8);
    expect(dataSet.goals).toHaveLength(2);
    expect(dataSet.trends.map((trend) => trend.month)).toEqual(['2026-02', '2026-03', '2026-04']);
    expect(dataSet.accounts.every(isDemoRecord)).toBe(true);
    expect(
      dataSet.transactions.every((transaction) => transaction.description.startsWith('Demo')),
    ).toBe(true);
  });

  it('keeps demo records out of export lists by default', () => {
    const dataSet = createSampleDemoData({ now: new Date('2026-04-20T12:00:00.000Z') });
    const realRecord = { id: 'real-budget', name: 'Real budget' };

    expect(filterDemoRecordsForExport([realRecord, ...dataSet.budgets])).toEqual([realRecord]);
  });

  it('summarizes reset impact before real setup starts', () => {
    const dataSet = createSampleDemoData({ now: new Date('2026-04-20T12:00:00.000Z') });

    expect(getDemoResetSummary(dataSet)).toBe(
      'Resetting demo mode will delete 19 fictional records before real setup begins.',
    );
  });
});
