// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import {
  collectEntitlementReliabilityMetrics,
  evaluateEntitlementReliabilityAlerts,
} from './entitlement-alerts.js';
import type { EntitlementReliabilitySample } from './entitlement-reliability.js';

function healthy(): EntitlementReliabilitySample {
  return {
    providers: [
      {
        provider: 'revenuecat',
        ingestionLagSeconds: 0,
        eventsReceived: 1,
        eventsRejected: 0,
        eventsDuplicate: 0,
        reconciliationAgeSeconds: 60,
      },
      {
        provider: 'stripe',
        ingestionLagSeconds: 0,
        eventsReceived: 1,
        eventsRejected: 0,
        eventsDuplicate: 0,
        reconciliationAgeSeconds: 60,
      },
    ],
    projectionDivergenceAccounts: 0,
    revocationBacklogJobs: 0,
    revocationOldestAgeSeconds: 0,
    revocationRetries: 0,
    revocationDeadLetterJobs: 0,
  };
}

describe('entitlement reliability collection and alerts', () => {
  it('publishes only the validated bounded-cardinality metric points', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const points = await collectEntitlementReliabilityMetrics(
      { collect: () => Promise.resolve(healthy()) },
      { publish },
    );

    expect(points).toHaveLength(15);
    expect(publish).toHaveBeenCalledWith(points);
    expect(JSON.stringify(points)).not.toContain('owner');
  });

  it('stays quiet when healthy and pages on divergence or dead letters', () => {
    expect(evaluateEntitlementReliabilityAlerts(healthy())).toEqual([]);
    const failing = healthy();
    failing.projectionDivergenceAccounts = 1;
    failing.revocationDeadLetterJobs = 2;

    expect(evaluateEntitlementReliabilityAlerts(failing)).toEqual([
      expect.objectContaining({ id: 'entitlement-projection-divergence', severity: 'critical' }),
      expect.objectContaining({ id: 'entitlement-revocation-dead-letter', severity: 'critical' }),
    ]);
  });

  it('escalates freshness and revocation-age symptoms at documented thresholds', () => {
    const failing = healthy();
    failing.providers[0].ingestionLagSeconds = 900;
    failing.providers[1].reconciliationAgeSeconds = 172_800;
    failing.revocationOldestAgeSeconds = 21_600;

    const alerts = evaluateEntitlementReliabilityAlerts(failing);
    expect(alerts).toHaveLength(3);
    expect(alerts.every(({ severity }) => severity === 'critical')).toBe(true);
  });
});
