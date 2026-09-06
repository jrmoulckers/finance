// SPDX-License-Identifier: BUSL-1.1

import {
  entitlementDisplay,
  type EntitlementEnvelope,
  type EntitlementTier,
  type EntitlementUnavailableReason,
} from './contract';

export type EntitlementPresentationStatus =
  | 'pending'
  | 'available'
  | 'unavailable'
  | 'stale'
  | 'offline-valid'
  | 'offline-expired'
  | 'refresh-needed';

export interface EntitlementPresentation {
  readonly status: EntitlementPresentationStatus;
  readonly envelope: EntitlementEnvelope | null;
  readonly displayTier: EntitlementTier;
  readonly bankConnectionAllowance: number;
  readonly needsRefresh: boolean;
  readonly reason?: EntitlementUnavailableReason;
  /** Only a current network response may preflight cost-incurring requests. */
  readonly serverActionPreflight: boolean;
}

export const PENDING_ENTITLEMENT: EntitlementPresentation = {
  status: 'pending',
  envelope: null,
  displayTier: 'free',
  bankConnectionAllowance: 0,
  needsRefresh: false,
  serverActionPreflight: false,
};

export function presentationFromNetwork(
  envelope: EntitlementEnvelope,
  now: Date = new Date(),
): EntitlementPresentation {
  const display = entitlementDisplay(envelope, now);
  return {
    status: display.needsRefresh ? 'refresh-needed' : 'available',
    envelope,
    displayTier: display.tier,
    bankConnectionAllowance: display.bankConnectionAllowance,
    needsRefresh: display.needsRefresh,
    // This is a UI preflight only. The called endpoint must re-read the server
    // projection and must never trust any value represented here.
    serverActionPreflight:
      !display.needsRefresh &&
      !display.reductionEffective &&
      envelope.entitlement.access_state === 'granted',
  };
}

export function presentationFromUnavailable(
  reason: EntitlementUnavailableReason,
  cached: EntitlementEnvelope | null,
  now: Date = new Date(),
): EntitlementPresentation {
  if (!cached || !allowsCachedDisplay(reason)) {
    return {
      status: 'unavailable',
      envelope: null,
      displayTier: 'free',
      bankConnectionAllowance: 0,
      needsRefresh: false,
      reason,
      serverActionPreflight: false,
    };
  }

  const display = entitlementDisplay(cached, now);
  const offline = reason === 'offline';
  return {
    status: offline ? (display.reductionEffective ? 'offline-expired' : 'offline-valid') : 'stale',
    envelope: cached,
    displayTier: display.tier,
    bankConnectionAllowance: display.bankConnectionAllowance,
    needsRefresh: display.needsRefresh,
    reason,
    // Cached state is display-only, even while it remains displayable offline.
    serverActionPreflight: false,
  };
}

export function allowsCachedDisplay(reason: EntitlementUnavailableReason): boolean {
  return reason === 'offline' || reason === 'projection_unavailable' || reason === 'rate_limited';
}

export function entitlementStatusText(state: EntitlementPresentation): string {
  const plan = `${displayTierName(state.displayTier)} plan`;
  switch (state.status) {
    case 'pending':
      return 'Checking plan status.';
    case 'available':
      return `${plan} confirmed by Finance.`;
    case 'refresh-needed':
      return `${plan} last confirmed; refresh needed.`;
    case 'stale':
      return `${plan} shown from a stale saved status. Refresh before starting connected services.`;
    case 'offline-valid':
      return state.needsRefresh
        ? `Offline. ${plan} is shown from saved status and needs refresh.`
        : `Offline. Showing the last confirmed ${plan.toLowerCase()}.`;
    case 'offline-expired':
      return 'Offline. A server-confirmed downgrade is effective; paid plan display is reduced until status refreshes.';
    case 'unavailable':
      return 'Plan status is unavailable. Manual entry, import, export, deletion, privacy and security controls, accessibility, and existing data remain available.';
  }
}

export function displayTierName(tier: EntitlementTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * UI-only preflight for requesting a bank connection. A true result merely
 * allows the request to reach the API; the API must re-read its projection.
 */
export function canPreflightBankConnection(
  state: EntitlementPresentation,
  currentConnectionCount: number,
): boolean {
  return (
    state.serverActionPreflight &&
    Number.isSafeInteger(currentConnectionCount) &&
    currentConnectionCount >= 0 &&
    currentConnectionCount < state.bankConnectionAllowance
  );
}
