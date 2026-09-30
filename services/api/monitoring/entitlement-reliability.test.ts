// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createEntitlementReliabilityMetrics,
  ENTITLEMENT_RELIABILITY_SLOS,
  type EntitlementReliabilitySample,
} from './entitlement-reliability.js';

function sample(): EntitlementReliabilitySample {
  return {
    providers: [
      {
        provider: 'revenuecat',
        ingestionLagSeconds: 12,
        eventsReceived: 120,
        eventsRejected: 2,
        eventsDuplicate: 4,
        reconciliationAgeSeconds: 3_600,
      },
      {
        provider: 'stripe',
        ingestionLagSeconds: 8,
        eventsReceived: 80,
        eventsRejected: 1,
        eventsDuplicate: 3,
        reconciliationAgeSeconds: 1_800,
      },
    ],
    projectionDivergenceAccounts: 0,
    revocationBacklogJobs: 3,
    revocationOldestAgeSeconds: 900,
    revocationRetries: 2,
    revocationDeadLetterJobs: 0,
  };
}

describe('entitlement reliability SLOs', () => {
  it('defines every user-centered objective with a bounded 30-day error budget', () => {
    expect(ENTITLEMENT_RELIABILITY_SLOS.map(({ id }) => id)).toEqual([
      'ingestion-freshness',
      'projection-correctness',
      'reconciliation-freshness',
      'revocation-completion',
    ]);
    for (const slo of ENTITLEMENT_RELIABILITY_SLOS) {
      expect(slo.rollingWindowDays).toBe(30);
      expect(slo.objective).toBeGreaterThanOrEqual(0.995);
      expect(slo.objective).toBeLessThan(1);
      expect(slo.allowedBadFraction).toBeCloseTo(1 - slo.objective);
    }
  });
});

describe('createEntitlementReliabilityMetrics', () => {
  it('emits all required provider and global reliability signals', () => {
    const metrics = createEntitlementReliabilityMetrics(sample());
    const names = new Set(metrics.map(({ name }) => name));

    expect(names).toEqual(
      new Set([
        'finance_entitlement_ingestion_lag_seconds',
        'finance_entitlement_events_received_total',
        'finance_entitlement_events_rejected_total',
        'finance_entitlement_events_duplicate_total',
        'finance_entitlement_reconciliation_age_seconds',
        'finance_entitlement_projection_divergence_accounts',
        'finance_entitlement_revocation_backlog_jobs',
        'finance_entitlement_revocation_oldest_age_seconds',
        'finance_entitlement_revocation_retries_total',
        'finance_entitlement_revocation_dead_letter_jobs',
      ]),
    );
    expect(metrics).toHaveLength(15);
  });

  it('emits only the fixed provider label and ignores extra sensitive input fields', () => {
    const sensitiveRuntimeInput = {
      ...sample(),
      accessToken: 'synthetic-secret-never-emit',
      providers: sample().providers.map((provider) => ({
        ...provider,
        customerId: `synthetic-customer-${provider.provider}`,
        householdId: `synthetic-household-${provider.provider}`,
      })),
    };

    const serialized = JSON.stringify(createEntitlementReliabilityMetrics(sensitiveRuntimeInput));
    expect(serialized).not.toContain('synthetic-secret-never-emit');
    expect(serialized).not.toContain('synthetic-customer');
    expect(serialized).not.toContain('synthetic-household');

    for (const metric of JSON.parse(serialized) as Array<{ labels: Record<string, unknown> }>) {
      expect(Object.keys(metric.labels).every((label) => label === 'provider')).toBe(true);
    }
  });

  it('orders provider points deterministically', () => {
    const reversed = sample();
    reversed.providers = [...reversed.providers].reverse();

    const metrics = createEntitlementReliabilityMetrics(reversed);
    expect(metrics.slice(0, 5).every(({ labels }) => labels.provider === 'revenuecat')).toBe(true);
    expect(metrics.slice(5, 10).every(({ labels }) => labels.provider === 'stripe')).toBe(true);
  });

  it('rejects missing, duplicate, negative, non-finite, and fractional counts', () => {
    const missing = sample();
    missing.providers = missing.providers.slice(0, 1);
    expect(() => createEntitlementReliabilityMetrics(missing)).toThrow(RangeError);

    const duplicate = sample();
    duplicate.providers = [duplicate.providers[0], duplicate.providers[0]];
    expect(() => createEntitlementReliabilityMetrics(duplicate)).toThrow(RangeError);

    const negative = sample();
    negative.revocationBacklogJobs = -1;
    expect(() => createEntitlementReliabilityMetrics(negative)).toThrow(RangeError);

    const infinite = sample();
    infinite.providers[0].ingestionLagSeconds = Number.POSITIVE_INFINITY;
    expect(() => createEntitlementReliabilityMetrics(infinite)).toThrow(RangeError);

    const fractional = sample();
    fractional.providers[0].eventsReceived = 1.5;
    expect(() => createEntitlementReliabilityMetrics(fractional)).toThrow(RangeError);
  });
});
