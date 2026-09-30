// SPDX-License-Identifier: BUSL-1.1

import {
  createEntitlementReliabilityMetrics,
  type EntitlementReliabilityMetricPoint,
  type EntitlementReliabilitySample,
} from './entitlement-reliability.js';

export type EntitlementAlertSeverity = 'warning' | 'critical';

export interface EntitlementReliabilityAlert {
  id: string;
  severity: EntitlementAlertSeverity;
  owner: 'backend' | 'backend-database-sre';
  runbook: 'provider-outage' | 'adapter-disable' | 'projection-rebuild';
  value: number;
  threshold: number;
  provider?: 'revenuecat' | 'stripe';
}

export interface EntitlementReliabilityCollector {
  collect(): Promise<EntitlementReliabilitySample>;
}

export interface EntitlementReliabilityMetricSink {
  publish(points: readonly EntitlementReliabilityMetricPoint[]): Promise<void>;
}

/** Collect and publish only the bounded aggregate metric schema. */
export async function collectEntitlementReliabilityMetrics(
  collector: EntitlementReliabilityCollector,
  sink: EntitlementReliabilityMetricSink,
): Promise<EntitlementReliabilityMetricPoint[]> {
  const points = createEntitlementReliabilityMetrics(await collector.collect());
  await sink.publish(points);
  return points;
}

/** Evaluate the actionable symptom alerts defined by the entitlement runbook. */
export function evaluateEntitlementReliabilityAlerts(
  sample: EntitlementReliabilitySample,
): EntitlementReliabilityAlert[] {
  const alerts: EntitlementReliabilityAlert[] = [];

  for (const provider of sample.providers) {
    if (provider.ingestionLagSeconds >= 300) {
      alerts.push({
        id: 'entitlement-ingestion-lag',
        severity: provider.ingestionLagSeconds >= 900 ? 'critical' : 'warning',
        owner: 'backend',
        runbook: 'provider-outage',
        value: provider.ingestionLagSeconds,
        threshold: provider.ingestionLagSeconds >= 900 ? 900 : 300,
        provider: provider.provider,
      });
    }
    if (provider.reconciliationAgeSeconds >= 86_400) {
      alerts.push({
        id: 'entitlement-reconciliation-stale',
        severity: provider.reconciliationAgeSeconds >= 172_800 ? 'critical' : 'warning',
        owner: 'backend',
        runbook: 'provider-outage',
        value: provider.reconciliationAgeSeconds,
        threshold: provider.reconciliationAgeSeconds >= 172_800 ? 172_800 : 86_400,
        provider: provider.provider,
      });
    }
  }

  if (sample.projectionDivergenceAccounts > 0) {
    alerts.push({
      id: 'entitlement-projection-divergence',
      severity: 'critical',
      owner: 'backend-database-sre',
      runbook: 'projection-rebuild',
      value: sample.projectionDivergenceAccounts,
      threshold: 1,
    });
  }
  if (sample.revocationOldestAgeSeconds >= 3_600) {
    const critical = sample.revocationOldestAgeSeconds >= 21_600;
    alerts.push({
      id: 'entitlement-revocation-stale',
      severity: critical ? 'critical' : 'warning',
      owner: critical ? 'backend-database-sre' : 'backend',
      runbook: 'adapter-disable',
      value: sample.revocationOldestAgeSeconds,
      threshold: critical ? 21_600 : 3_600,
    });
  }
  if (sample.revocationDeadLetterJobs > 0) {
    alerts.push({
      id: 'entitlement-revocation-dead-letter',
      severity: 'critical',
      owner: 'backend-database-sre',
      runbook: 'adapter-disable',
      value: sample.revocationDeadLetterJobs,
      threshold: 1,
    });
  }

  return alerts;
}
