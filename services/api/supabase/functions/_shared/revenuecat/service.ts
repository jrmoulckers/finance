// SPDX-License-Identifier: BUSL-1.1

import type { RevenueCatConfig } from './config.ts';
import type { RevenueCatClient } from './client.ts';
import {
  type NormalizedBillingEvidence,
  normalizeRevenueCatEvent,
  type RevenueCatEvent,
} from './normalization.ts';
import type { EntitlementProjection, RevenueCatIdentity, RevenueCatStore } from './store.ts';

export interface IngestionResult {
  recognized: number;
  applied: number;
  ignored: number;
}

async function familyBinding(
  event: RevenueCatEvent,
  config: RevenueCatConfig,
  store: RevenueCatStore,
  householdIntent: string | null,
): Promise<string | null> {
  const preview = normalizeRevenueCatEvent(
    event,
    config,
    householdIntent ?? '00000000-0000-4000-8000-000000000000',
  );
  if (preview.evidence?.tier !== 'family') return null;
  return (
    householdIntent ??
    (await store.findFamilyBinding(preview.evidence as NormalizedBillingEvidence))
  );
}

export async function ingestRevenueCatEvents(
  events: readonly RevenueCatEvent[],
  config: RevenueCatConfig,
  store: RevenueCatStore,
  options: {
    ownerId?: string;
    expectedCustomerId?: string;
    identity?: RevenueCatIdentity;
    householdIntent?: string | null;
  } = {},
): Promise<IngestionResult> {
  let recognized = 0;
  let applied = 0;
  let ignored = 0;

  for (const event of events) {
    const boundHousehold = await familyBinding(
      event,
      config,
      store,
      options.householdIntent ?? null,
    );
    const normalized = normalizeRevenueCatEvent(
      event,
      config,
      boundHousehold,
      options.ownerId ?? options.expectedCustomerId,
    );
    if (!normalized.evidence) {
      ignored++;
      continue;
    }

    const identity =
      options.identity ??
      (options.ownerId
        ? await store.bindCustomer(
            options.ownerId,
            options.ownerId,
            normalized.evidence.environment,
          )
        : await store.findIdentity(normalized.customerIds, normalized.evidence.environment));
    if (!identity) {
      ignored++;
      continue;
    }

    recognized++;
    if (await store.appendAndApply(identity, normalized.evidence)) applied++;
  }

  return { recognized, applied, ignored };
}

export interface ConfirmationResult {
  status: 'pending' | 'confirmed';
  entitlement: EntitlementProjection;
}

export async function confirmRevenueCatPurchase(
  ownerId: string,
  householdId: string | null,
  appId: string,
  environment: string,
  config: RevenueCatConfig,
  client: Pick<RevenueCatClient, 'getCustomerEvents'>,
  store: RevenueCatStore,
): Promise<ConfirmationResult> {
  if (!config.apps[appId] || environment.toLowerCase() !== config.environment) {
    throw new Error('invalid_request');
  }
  if (householdId && !(await store.verifyHouseholdMembership(ownerId, householdId))) {
    throw new Error('household_access_denied');
  }

  const events = (await client.getCustomerEvents(ownerId)).filter(
    (event) => event.app_id === appId,
  );
  const result = await ingestRevenueCatEvents(events, config, store, {
    ownerId,
    householdIntent: householdId,
  });
  return {
    status: result.recognized > 0 ? 'confirmed' : 'pending',
    entitlement: await store.getProjection(ownerId, householdId),
  };
}
