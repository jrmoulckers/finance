// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import {
  ENTITLEMENT_MAINTENANCE_SCHEDULES,
  invokeEntitlementMaintenance,
  type EntitlementMaintenanceDependencies,
} from './entitlement-maintenance.js';

function dependencies(
  responses: Response[],
  leaseToken: string | null = 'lease-token',
): EntitlementMaintenanceDependencies {
  return {
    baseUrl: 'https://staging.example.test',
    readSecret: () => 'synthetic-scheduler-secret',
    lease: {
      acquire: vi.fn().mockResolvedValue(leaseToken),
      release: vi.fn().mockResolvedValue(undefined),
    },
    fetch: vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!)),
    sleep: vi.fn().mockResolvedValue(undefined),
  };
}

describe('entitlement maintenance schedules', () => {
  it('defines explicit cadence, retry, missed-run, ownership, and bounded overlap for every task', () => {
    expect(ENTITLEMENT_MAINTENANCE_SCHEDULES.map(({ id }) => id)).toEqual([
      'revenuecat-reconciliation',
      'stripe-reconciliation',
      'bank-revocation-maintenance',
    ]);
    for (const schedule of ENTITLEMENT_MAINTENANCE_SCHEDULES) {
      expect(schedule.cadenceMinutes).toBeGreaterThan(0);
      expect(schedule.retryDelaysSeconds).toHaveLength(2);
      expect(schedule.missedRunAfterSeconds).toBeGreaterThan(schedule.cadenceMinutes * 60);
      expect(schedule.overlapLeaseSeconds).toBeLessThan(schedule.cadenceMinutes * 60);
    }
  });

  it('authenticates, retries retryable failures, and releases the lease', async () => {
    const deps = dependencies([
      new Response(null, { status: 503 }),
      new Response(null, { status: 204 }),
    ]);
    const result = await invokeEntitlementMaintenance(
      'bank-revocation-maintenance',
      'schedule',
      deps,
    );

    expect(result).toEqual({
      task: 'bank-revocation-maintenance',
      trigger: 'schedule',
      outcome: 'succeeded',
      attempts: 2,
      httpStatus: 204,
    });
    expect(deps.fetch).toHaveBeenCalledWith(
      new URL('https://staging.example.test/functions/v1/process-bank-revocations'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-scheduler-secret',
        }),
      }),
    );
    expect(deps.lease.release).toHaveBeenCalledOnce();
  });

  it('skips overlapping work and supports an explicit manual catch-up trigger', async () => {
    const overlap = dependencies([], null);
    await expect(
      invokeEntitlementMaintenance('stripe-reconciliation', 'manual-catch-up', overlap),
    ).resolves.toEqual({
      task: 'stripe-reconciliation',
      trigger: 'manual-catch-up',
      outcome: 'overlap-skipped',
      attempts: 0,
      httpStatus: null,
    });
    expect(overlap.fetch).not.toHaveBeenCalled();
  });

  it('drains reconciliation continuation cursors under one lease', async () => {
    const deps = dependencies([
      Response.json({ next_cursor: 'v1:100' }),
      Response.json({ next_cursor: null }),
    ]);
    const result = await invokeEntitlementMaintenance(
      'revenuecat-reconciliation',
      'schedule',
      deps,
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.attempts).toBe(2);
    expect(deps.lease.acquire).toHaveBeenCalledOnce();
    expect(deps.lease.release).toHaveBeenCalledOnce();
    expect(deps.fetch).toHaveBeenLastCalledWith(
      new URL('https://staging.example.test/functions/v1/revenuecat-reconcile?cursor=v1%3A100'),
      expect.anything(),
    );
  });

  it('fails closed before invocation when scheduler authorization is absent', async () => {
    const deps = dependencies([]);
    deps.readSecret = () => undefined;
    await expect(
      invokeEntitlementMaintenance('revenuecat-reconciliation', 'schedule', deps),
    ).rejects.toThrow('Maintenance authorization is not configured');
    expect(deps.lease.acquire).not.toHaveBeenCalled();
  });
});
