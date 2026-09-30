// SPDX-License-Identifier: BUSL-1.1

/**
 * Secret-safe observability contract for server-authoritative entitlements (#4406).
 *
 * The collector that supplies this module may inspect server-only billing and
 * revocation state, but this module deliberately accepts and emits only aggregate
 * counts, ages, and the fixed provider enum. Provider/customer/subscription IDs,
 * household/user IDs, credentials, ciphertext, and financial values cannot be
 * represented in the emitted metric shape.
 *
 * @module
 */

/** Provider adapters included in the entitlement reliability SLO. */
export type EntitlementProvider = 'revenuecat' | 'stripe';

/** Metric names approved for entitlement dashboards and alerts. */
export type EntitlementReliabilityMetricName =
  | 'finance_entitlement_ingestion_lag_seconds'
  | 'finance_entitlement_events_received_total'
  | 'finance_entitlement_events_rejected_total'
  | 'finance_entitlement_events_duplicate_total'
  | 'finance_entitlement_reconciliation_age_seconds'
  | 'finance_entitlement_projection_divergence_accounts'
  | 'finance_entitlement_revocation_backlog_jobs'
  | 'finance_entitlement_revocation_oldest_age_seconds'
  | 'finance_entitlement_revocation_retries_total'
  | 'finance_entitlement_revocation_dead_letter_jobs';

/** Units used by the approved entitlement metrics. */
export type EntitlementReliabilityMetricUnit = 'seconds' | 'events' | 'accounts' | 'jobs';

/** A provider-specific aggregate collected without provider identities. */
export interface EntitlementProviderReliabilitySample {
  provider: EntitlementProvider;
  ingestionLagSeconds: number;
  eventsReceived: number;
  eventsRejected: number;
  eventsDuplicate: number;
  reconciliationAgeSeconds: number;
}

/** Aggregate inputs for one entitlement reliability observation. */
export interface EntitlementReliabilitySample {
  providers: readonly EntitlementProviderReliabilitySample[];
  projectionDivergenceAccounts: number;
  revocationBacklogJobs: number;
  revocationOldestAgeSeconds: number;
  revocationRetries: number;
  revocationDeadLetterJobs: number;
}

/**
 * A bounded-cardinality metric point.
 *
 * `provider` is the only permitted label. Global projection and revocation
 * metrics have no labels.
 */
export interface EntitlementReliabilityMetricPoint {
  name: EntitlementReliabilityMetricName;
  kind: 'counter' | 'gauge';
  unit: EntitlementReliabilityMetricUnit;
  value: number;
  labels: Readonly<{ provider?: EntitlementProvider }>;
}

/** Entitlement SLO definition used by dashboards, alerts, and review evidence. */
export interface EntitlementReliabilitySlo {
  id:
    | 'ingestion-freshness'
    | 'projection-correctness'
    | 'reconciliation-freshness'
    | 'revocation-completion';
  objective: number;
  rollingWindowDays: 30;
  successThresholdSeconds: number | null;
  allowedBadFraction: number;
}

/**
 * Approved 30-day entitlement SLOs.
 *
 * Rejected and duplicate events, retry volume, and dead letters are diagnostic
 * signals rather than separate availability objectives. They explain or predict
 * failures of these user-centered outcomes.
 */
export const ENTITLEMENT_RELIABILITY_SLOS: readonly EntitlementReliabilitySlo[] = [
  {
    id: 'ingestion-freshness',
    objective: 0.999,
    rollingWindowDays: 30,
    successThresholdSeconds: 300,
    allowedBadFraction: 0.001,
  },
  {
    id: 'projection-correctness',
    objective: 0.9999,
    rollingWindowDays: 30,
    successThresholdSeconds: null,
    allowedBadFraction: 0.0001,
  },
  {
    id: 'reconciliation-freshness',
    objective: 0.995,
    rollingWindowDays: 30,
    successThresholdSeconds: 86_400,
    allowedBadFraction: 0.005,
  },
  {
    id: 'revocation-completion',
    objective: 0.999,
    rollingWindowDays: 30,
    successThresholdSeconds: 21_600,
    allowedBadFraction: 0.001,
  },
] as const;

function requireNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative finite number`);
  }
}

function requireCount(value: number, field: string): void {
  requireNonNegativeFinite(value, field);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

function validateProviderSamples(providers: readonly EntitlementProviderReliabilitySample[]): void {
  const expected = new Set<EntitlementProvider>(['revenuecat', 'stripe']);
  const seen = new Set<EntitlementProvider>();

  for (const sample of providers) {
    if (!expected.has(sample.provider) || seen.has(sample.provider)) {
      throw new RangeError('providers must contain one revenuecat and one stripe sample');
    }
    seen.add(sample.provider);
    requireNonNegativeFinite(sample.ingestionLagSeconds, 'ingestionLagSeconds');
    requireCount(sample.eventsReceived, 'eventsReceived');
    requireCount(sample.eventsRejected, 'eventsRejected');
    requireCount(sample.eventsDuplicate, 'eventsDuplicate');
    requireNonNegativeFinite(sample.reconciliationAgeSeconds, 'reconciliationAgeSeconds');
  }

  if (seen.size !== expected.size) {
    throw new RangeError('providers must contain one revenuecat and one stripe sample');
  }
}

/**
 * Build the only metric payload approved for entitlement reliability.
 *
 * The fixed output schema ignores any extra properties present on runtime
 * inputs, preventing accidental propagation of provider or tenant identifiers.
 */
export function createEntitlementReliabilityMetrics(
  sample: EntitlementReliabilitySample,
): EntitlementReliabilityMetricPoint[] {
  validateProviderSamples(sample.providers);
  requireCount(sample.projectionDivergenceAccounts, 'projectionDivergenceAccounts');
  requireCount(sample.revocationBacklogJobs, 'revocationBacklogJobs');
  requireNonNegativeFinite(sample.revocationOldestAgeSeconds, 'revocationOldestAgeSeconds');
  requireCount(sample.revocationRetries, 'revocationRetries');
  requireCount(sample.revocationDeadLetterJobs, 'revocationDeadLetterJobs');

  const points: EntitlementReliabilityMetricPoint[] = [];
  for (const provider of [...sample.providers].sort((a, b) =>
    a.provider.localeCompare(b.provider),
  )) {
    const labels = Object.freeze({ provider: provider.provider });
    points.push(
      {
        name: 'finance_entitlement_ingestion_lag_seconds',
        kind: 'gauge',
        unit: 'seconds',
        value: provider.ingestionLagSeconds,
        labels,
      },
      {
        name: 'finance_entitlement_events_received_total',
        kind: 'counter',
        unit: 'events',
        value: provider.eventsReceived,
        labels,
      },
      {
        name: 'finance_entitlement_events_rejected_total',
        kind: 'counter',
        unit: 'events',
        value: provider.eventsRejected,
        labels,
      },
      {
        name: 'finance_entitlement_events_duplicate_total',
        kind: 'counter',
        unit: 'events',
        value: provider.eventsDuplicate,
        labels,
      },
      {
        name: 'finance_entitlement_reconciliation_age_seconds',
        kind: 'gauge',
        unit: 'seconds',
        value: provider.reconciliationAgeSeconds,
        labels,
      },
    );
  }

  const noLabels = Object.freeze({});
  points.push(
    {
      name: 'finance_entitlement_projection_divergence_accounts',
      kind: 'gauge',
      unit: 'accounts',
      value: sample.projectionDivergenceAccounts,
      labels: noLabels,
    },
    {
      name: 'finance_entitlement_revocation_backlog_jobs',
      kind: 'gauge',
      unit: 'jobs',
      value: sample.revocationBacklogJobs,
      labels: noLabels,
    },
    {
      name: 'finance_entitlement_revocation_oldest_age_seconds',
      kind: 'gauge',
      unit: 'seconds',
      value: sample.revocationOldestAgeSeconds,
      labels: noLabels,
    },
    {
      name: 'finance_entitlement_revocation_retries_total',
      kind: 'counter',
      unit: 'jobs',
      value: sample.revocationRetries,
      labels: noLabels,
    },
    {
      name: 'finance_entitlement_revocation_dead_letter_jobs',
      kind: 'gauge',
      unit: 'jobs',
      value: sample.revocationDeadLetterJobs,
      labels: noLabels,
    },
  );

  return points;
}
