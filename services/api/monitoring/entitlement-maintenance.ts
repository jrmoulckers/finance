// SPDX-License-Identifier: BUSL-1.1

export type EntitlementMaintenanceTask =
  'revenuecat-reconciliation' | 'stripe-reconciliation' | 'bank-revocation-maintenance';

export interface EntitlementMaintenanceSchedule {
  id: EntitlementMaintenanceTask;
  cadenceMinutes: number;
  endpointPath: string;
  authorizationEnv: string;
  authorizationScheme: 'configured-header' | 'bearer-token';
  overlapLeaseSeconds: number;
  attemptTimeoutSeconds: number;
  retryDelaysSeconds: readonly number[];
  missedRunAfterSeconds: number;
  owner: 'backend-billing' | 'backend-banking';
}

export const ENTITLEMENT_MAINTENANCE_SCHEDULES: readonly EntitlementMaintenanceSchedule[] = [
  {
    id: 'revenuecat-reconciliation',
    cadenceMinutes: 60,
    endpointPath: '/functions/v1/revenuecat-reconcile',
    authorizationEnv: 'REVENUECAT_RECONCILIATION_AUTHORIZATION',
    authorizationScheme: 'configured-header',
    overlapLeaseSeconds: 3_300,
    attemptTimeoutSeconds: 300,
    retryDelaysSeconds: [60, 300],
    missedRunAfterSeconds: 7_200,
    owner: 'backend-billing',
  },
  {
    id: 'stripe-reconciliation',
    cadenceMinutes: 60,
    endpointPath: '/functions/v1/stripe-reconcile',
    authorizationEnv: 'STRIPE_RECONCILIATION_AUTHORIZATION',
    authorizationScheme: 'configured-header',
    overlapLeaseSeconds: 3_300,
    attemptTimeoutSeconds: 300,
    retryDelaysSeconds: [60, 300],
    missedRunAfterSeconds: 7_200,
    owner: 'backend-billing',
  },
  {
    id: 'bank-revocation-maintenance',
    cadenceMinutes: 5,
    endpointPath: '/functions/v1/process-bank-revocations',
    authorizationEnv: 'CRON_SECRET',
    authorizationScheme: 'bearer-token',
    overlapLeaseSeconds: 240,
    attemptTimeoutSeconds: 120,
    retryDelaysSeconds: [30, 60],
    missedRunAfterSeconds: 900,
    owner: 'backend-banking',
  },
] as const;

export interface EntitlementMaintenanceLease {
  acquire(task: EntitlementMaintenanceTask, leaseSeconds: number): Promise<string | null>;
  release(task: EntitlementMaintenanceTask, leaseToken: string): Promise<void>;
}

export interface EntitlementMaintenanceDependencies {
  baseUrl: string;
  readSecret(name: string): string | undefined;
  lease: EntitlementMaintenanceLease;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  sleep(delaySeconds: number): Promise<void>;
}

export interface EntitlementMaintenanceResult {
  task: EntitlementMaintenanceTask;
  trigger: 'schedule' | 'manual-catch-up';
  outcome: 'succeeded' | 'overlap-skipped' | 'failed';
  attempts: number;
  httpStatus: number | null;
}

/**
 * Invoke one maintenance task with authentication, bounded retries, and a
 * durable lease supplied by the deployment adapter. Results contain no tenant
 * or provider identity and are suitable for missed-run monitoring.
 */
export async function invokeEntitlementMaintenance(
  task: EntitlementMaintenanceTask,
  trigger: EntitlementMaintenanceResult['trigger'],
  dependencies: EntitlementMaintenanceDependencies,
): Promise<EntitlementMaintenanceResult> {
  const schedule = ENTITLEMENT_MAINTENANCE_SCHEDULES.find(({ id }) => id === task);
  if (!schedule) throw new RangeError('Unknown entitlement maintenance task');
  const credential = dependencies.readSecret(schedule.authorizationEnv);
  if (!credential) throw new Error('Maintenance authorization is not configured');
  const authorization =
    schedule.authorizationScheme === 'bearer-token' ? `Bearer ${credential}` : credential;
  const leaseToken = await dependencies.lease.acquire(task, schedule.overlapLeaseSeconds);
  if (!leaseToken) {
    return { task, trigger, outcome: 'overlap-skipped', attempts: 0, httpStatus: null };
  }

  let attempts = 0;
  let httpStatus: number | null = null;
  try {
    let cursor: string | null = null;
    for (let page = 0; page < 100; page++) {
      for (let retry = 0; retry <= schedule.retryDelaysSeconds.length; retry++) {
        attempts++;
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          schedule.attemptTimeoutSeconds * 1_000,
        );
        try {
          const url = new URL(schedule.endpointPath, dependencies.baseUrl);
          if (cursor) url.searchParams.set('cursor', cursor);
          const response = await dependencies.fetch(url, {
            method: 'POST',
            headers: {
              Authorization: authorization,
              'X-Finance-Maintenance-Task': task,
              'X-Finance-Maintenance-Trigger': trigger,
            },
            signal: controller.signal,
          });
          httpStatus = response.status;
          if (response.ok) {
            const body = (await response.json().catch(() => null)) as {
              next_cursor?: unknown;
              nextCursor?: unknown;
            } | null;
            const nextCursor = body?.next_cursor ?? body?.nextCursor ?? null;
            if (nextCursor !== null && typeof nextCursor !== 'string') {
              return { task, trigger, outcome: 'failed', attempts, httpStatus };
            }
            cursor = nextCursor;
            break;
          }
          if (response.status < 500 && response.status !== 429) {
            return { task, trigger, outcome: 'failed', attempts, httpStatus };
          }
        } catch {
          httpStatus = null;
        } finally {
          clearTimeout(timeout);
        }

        const delay = schedule.retryDelaysSeconds[retry];
        if (delay === undefined) {
          return { task, trigger, outcome: 'failed', attempts, httpStatus };
        }
        await dependencies.sleep(delay);
      }
      if (!cursor) return { task, trigger, outcome: 'succeeded', attempts, httpStatus };
    }
    return { task, trigger, outcome: 'failed', attempts, httpStatus };
  } finally {
    await dependencies.lease.release(task, leaseToken);
  }
}
