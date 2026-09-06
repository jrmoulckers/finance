// SPDX-License-Identifier: BUSL-1.1

import type { RevenueCatConfig } from './config.ts';
import type { RevenueCatClient } from './client.ts';
import {
  type NormalizedBillingEvidence,
  normalizeRevenueCatEvent,
  type RevenueCatEvent,
  type RevenueCatProductNamespace,
} from './normalization.ts';
import type { EntitlementProjection, RevenueCatIdentity, RevenueCatStore } from './store.ts';

interface PurchaseCandidate {
  identity: RevenueCatIdentity;
  providerSubscriptionId: string;
  accessBearing: boolean;
  evidence: NormalizedBillingEvidence;
}

export interface IngestionResult {
  recognized: number;
  applied: number;
  accessBearingRecognized: number;
  accessBearingApplied: number;
  ignored: number;
  latestCandidate: PurchaseCandidate | null;
}

const ACCESS_BEARING_LIFECYCLES = new Set([
  'trialing',
  'active',
  'cancelled_paid_through',
  'past_due_grace',
  'paused_paid_through',
]);
const FAMILY_BINDING_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';
const LIFECYCLE_PRECEDENCE: Record<NormalizedBillingEvidence['lifecycle'], number> = {
  trialing: 10,
  active: 20,
  cancelled_paid_through: 30,
  past_due_grace: 40,
  paused_paid_through: 50,
  expired: 60,
  refunded: 70,
  chargeback: 80,
};

export function projectionGrantsAccess(projection: EntitlementProjection): boolean {
  return (
    projection.userTier !== 'free' ||
    (projection.householdTier !== null && projection.householdTier !== 'free')
  );
}

function candidateIsNewer(
  candidate: PurchaseCandidate,
  current: PurchaseCandidate | null,
): boolean {
  if (!current) return true;
  const effectiveDifference =
    Date.parse(candidate.evidence.effectiveAt) - Date.parse(current.evidence.effectiveAt);
  if (effectiveDifference !== 0) return effectiveDifference > 0;
  if (candidate.evidence.providerOrder !== current.evidence.providerOrder) {
    return candidate.evidence.providerOrder > current.evidence.providerOrder;
  }
  const precedenceDifference =
    LIFECYCLE_PRECEDENCE[candidate.evidence.lifecycle] -
    LIFECYCLE_PRECEDENCE[current.evidence.lifecycle];
  if (precedenceDifference !== 0) return precedenceDifference > 0;
  return candidate.evidence.providerEventId > current.evidence.providerEventId;
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
    productNamespace?: RevenueCatProductNamespace;
  } = {},
): Promise<IngestionResult> {
  let recognized = 0;
  let applied = 0;
  let accessBearingRecognized = 0;
  let accessBearingApplied = 0;
  let ignored = 0;
  let latestCandidate: PurchaseCandidate | null = null;

  for (const event of events) {
    let normalized = normalizeRevenueCatEvent(
      event,
      config,
      options.householdIntent ?? FAMILY_BINDING_PLACEHOLDER,
      options.ownerId ?? options.expectedCustomerId,
      options.productNamespace,
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

    if (normalized.evidence.tier === 'family') {
      const historicalBinding = await store.findFamilyBinding(identity, normalized.evidence);
      const boundHousehold = historicalBinding ?? options.householdIntent ?? null;
      if (!boundHousehold) {
        ignored++;
        continue;
      }
      normalized = normalizeRevenueCatEvent(
        event,
        config,
        boundHousehold,
        options.ownerId ?? options.expectedCustomerId,
        options.productNamespace,
      );
      if (!normalized.evidence) {
        ignored++;
        continue;
      }
    }

    recognized++;
    const accessBearing = ACCESS_BEARING_LIFECYCLES.has(normalized.evidence.lifecycle);
    if (accessBearing) accessBearingRecognized++;
    const appendResult = await store.appendAndApply(identity, normalized.evidence);
    if (appendResult.applied) {
      applied++;
      if (accessBearing) accessBearingApplied++;
    }
    const candidate: PurchaseCandidate = {
      identity,
      providerSubscriptionId: appendResult.providerSubscriptionId,
      accessBearing,
      evidence: normalized.evidence,
    };
    if (candidateIsNewer(candidate, latestCandidate)) latestCandidate = candidate;
  }

  return {
    recognized,
    applied,
    accessBearingRecognized,
    accessBearingApplied,
    ignored,
    latestCandidate,
  };
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
    productNamespace: 'revenuecat',
  });
  const entitlement = await store.getProjection(ownerId, householdId);
  const candidate = result.latestCandidate;
  const candidateGrantsAccess =
    candidate?.accessBearing === true &&
    (await store.purchaseGrantsAccess(
      candidate.identity,
      candidate.providerSubscriptionId,
      ownerId,
      candidate.evidence.boundHouseholdId,
    ));
  return {
    status: candidateGrantsAccess ? 'confirmed' : 'pending',
    entitlement,
  };
}
